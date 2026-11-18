"""
tiny_transformer_mps.py

A minimal character-level Transformer language model with:

    - Apple Silicon / Metal (MPS) support
    - CUDA support
    - CPU fallback
    - float32 enforcement
    - optional MPS -> CPU operator fallback
    - train/validation split
    - checkpoint saving
    - autoregressive text generation

The overall workflow is:

    text file
        |
        v
    character vocabulary
        |
        v
    integer tokenization
        |
        v
    training batches
        |
        v
    tiny causal Transformer
        |
        v
    trained language model
        |
        v
    autoregressive sampling

Install:

    pip install torch

Example:

    python tiny_transformer_mps.py \
        --input_file data.txt \
        --max_steps 5000 \
        --sample_prompt "The "

Force a specific device:

    python tiny_transformer_mps.py --input_file data.txt --device mps
    python tiny_transformer_mps.py --input_file data.txt --device cuda
    python tiny_transformer_mps.py --input_file data.txt --device cpu

Save a checkpoint:

    python tiny_transformer_mps.py \
        --input_file data.txt \
        --max_steps 5000 \
        --save_model checkpoints/tiny_transformer.pt
"""

# ============================================================
# 1. Imports and MPS configuration
# ============================================================

from __future__ import annotations

import argparse
import os
import random
from pathlib import Path

# If an MPS operation is not implemented, PyTorch can fall back
# to the CPU rather than immediately failing.
#
# IMPORTANT:
# This must be set before importing torch.
#
# This does NOT make float64 work on MPS. The model explicitly
# uses float32 throughout.
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

import torch
import torch.nn as nn
import torch.nn.functional as F


# ============================================================
# 2. Configuration
# ============================================================

class ModelConfig:
    """
    Configuration for the tiny Transformer.
    """

    def __init__(
        self,
        block_size: int = 128,
        embedding_dim: int = 128,
        num_heads: int = 4,
        num_layers: int = 4,
        dropout: float = 0.1,
    ):
        self.block_size = block_size
        self.embedding_dim = embedding_dim
        self.num_heads = num_heads
        self.num_layers = num_layers
        self.dropout = dropout

        if embedding_dim % num_heads != 0:
            raise ValueError(
                "embedding_dim must be divisible by num_heads."
            )


# ============================================================
# 3. Reproducibility
# ============================================================

def set_seed(seed: int) -> None:
    """
    Set random seeds for reproducible experiments.
    """

    random.seed(seed)
    torch.manual_seed(seed)

    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


# ============================================================
# 4. Device selection
# ============================================================

def get_device(requested_device: str) -> torch.device:
    """
    Select the computational device.

    Device priority in automatic mode:

        MPS -> CUDA -> CPU

    Parameters
    ----------
    requested_device:
        One of:
            "auto"
            "mps"
            "cuda"
            "cpu"
    """

    if requested_device == "cpu":
        print("Using CPU")
        return torch.device("cpu")

    if requested_device == "cuda":
        if torch.cuda.is_available():
            print("Using CUDA")
            return torch.device("cuda")

        raise RuntimeError(
            "CUDA was explicitly requested, but CUDA is not available."
        )

    if requested_device == "mps":
        if not hasattr(torch.backends, "mps"):
            raise RuntimeError(
                "This PyTorch installation does not expose the MPS backend."
            )

        if not torch.backends.mps.is_built():
            raise RuntimeError(
                "PyTorch was not built with MPS support."
            )

        if not torch.backends.mps.is_available():
            raise RuntimeError(
                "MPS is built into PyTorch but is not available on this machine."
            )

        print("Using Apple Silicon MPS")
        return torch.device("mps")

    # --------------------------------------------------------
    # Automatic device selection
    # --------------------------------------------------------

    if hasattr(torch.backends, "mps"):

        if torch.backends.mps.is_available():
            print("Using Apple Silicon MPS")
            return torch.device("mps")

        if torch.backends.mps.is_built():
            print(
                "MPS support is present in PyTorch, "
                "but MPS is not currently available."
            )
        else:
            print("MPS support is not present in this PyTorch installation.")

    if torch.cuda.is_available():
        print("Using CUDA")
        return torch.device("cuda")

    print("Using CPU")
    return torch.device("cpu")


# ============================================================
# 5. Text loading
# ============================================================

def load_text(file_path: Path) -> str:
    """
    Load UTF-8 text from disk.
    """

    if not file_path.exists():
        raise FileNotFoundError(
            f"Input file does not exist: {file_path}"
        )

    text = file_path.read_text(encoding="utf-8")

    if not text:
        raise ValueError(
            f"Input file is empty: {file_path}"
        )

    return text


# ============================================================
# 6. Character vocabulary
# ============================================================

def build_vocabulary(text: str):
    """
    Build character <-> integer mappings.

    Example:

        "abcabc"

    might produce:

        a -> 0
        b -> 1
        c -> 2
    """

    unique_characters = sorted(set(text))

    character_to_index = {
        character: index
        for index, character in enumerate(unique_characters)
    }

    index_to_character = {
        index: character
        for character, index in character_to_index.items()
    }

    vocabulary_size = len(unique_characters)

    return (
        vocabulary_size,
        character_to_index,
        index_to_character,
    )


def encode_text(
    text: str,
    character_to_index: dict[str, int],
) -> torch.Tensor:
    """
    Convert characters to integer token IDs.
    """

    token_ids = [
        character_to_index[character]
        for character in text
    ]

    return torch.tensor(
        token_ids,
        dtype=torch.long,
    )


def decode_tokens(
    token_ids: torch.Tensor,
    index_to_character: dict[int, str],
) -> str:
    """
    Convert integer token IDs back into text.
    """

    return "".join(
        index_to_character[token_id]
        for token_id in token_ids.tolist()
    )


# ============================================================
# 7. Train / validation split
# ============================================================

def split_dataset(
    token_data: torch.Tensor,
    train_fraction: float = 0.9,
) -> tuple[torch.Tensor, torch.Tensor]:

    split_index = int(
        len(token_data) * train_fraction
    )

    train_data = token_data[:split_index]
    validation_data = token_data[split_index:]

    return train_data, validation_data


# ============================================================
# 8. Mini-batch generation
# ============================================================

def create_batch_loader(
    train_data: torch.Tensor,
    validation_data: torch.Tensor,
    block_size: int,
    batch_size: int,
    device: torch.device,
):
    """
    Create a function that samples random training batches.

    Each input sequence:

        x[t] = current character

    has a target sequence:

        y[t] = next character

    Example:

        input:
            "hello worl"

        target:
            "ello world"
    """

    def get_batch(split: str):

        if split == "train":
            data = train_data

        elif split == "validation":
            data = validation_data

        else:
            raise ValueError(
                "split must be 'train' or 'validation'."
            )

        number_of_possible_positions = (
            len(data) - block_size
        )

        if number_of_possible_positions <= 0:
            raise ValueError(
                "Dataset is too small for the selected block_size."
            )

        start_indices = torch.randint(
            low=0,
            high=number_of_possible_positions,
            size=(batch_size,),
        )

        input_batch = torch.stack(
            [
                data[start_index : start_index + block_size]
                for start_index in start_indices
            ]
        )

        target_batch = torch.stack(
            [
                data[
                    start_index + 1 :
                    start_index + block_size + 1
                ]
                for start_index in start_indices
            ]
        )

        # Token IDs are integers, so they correctly remain
        # torch.long rather than float32.
        input_batch = input_batch.to(device)
        target_batch = target_batch.to(device)

        return input_batch, target_batch

    return get_batch


# ============================================================
# 9. Causal self-attention
# ============================================================

class CausalSelfAttention(nn.Module):

    def __init__(
        self,
        embedding_dim: int,
        num_heads: int,
        block_size: int,
        dropout: float,
    ):
        super().__init__()

        if embedding_dim % num_heads != 0:
            raise ValueError(
                "embedding_dim must be divisible by num_heads."
            )

        self.num_heads = num_heads
        self.head_dimension = embedding_dim // num_heads

        self.query_projection = nn.Linear(
            embedding_dim,
            embedding_dim,
            bias=False,
        )

        self.key_projection = nn.Linear(
            embedding_dim,
            embedding_dim,
            bias=False,
        )

        self.value_projection = nn.Linear(
            embedding_dim,
            embedding_dim,
            bias=False,
        )

        self.output_projection = nn.Linear(
            embedding_dim,
            embedding_dim,
            bias=False,
        )

        self.dropout = nn.Dropout(dropout)

        # Upper-triangular elements are masked so a token
        # cannot "see the future".
        causal_mask = torch.tril(
            torch.ones(
                block_size,
                block_size,
                dtype=torch.float32,
            )
        )

        self.register_buffer(
            "causal_mask",
            causal_mask.view(
                1,
                1,
                block_size,
                block_size,
            ),
        )

    def forward(
        self,
        hidden_states: torch.Tensor,
    ) -> torch.Tensor:

        batch_size, sequence_length, embedding_dim = (
            hidden_states.shape
        )

        query = self.query_projection(hidden_states)
        key = self.key_projection(hidden_states)
        value = self.value_projection(hidden_states)

        query = query.reshape(
            batch_size,
            sequence_length,
            self.num_heads,
            self.head_dimension,
        ).transpose(1, 2)

        key = key.reshape(
            batch_size,
            sequence_length,
            self.num_heads,
            self.head_dimension,
        ).transpose(1, 2)

        value = value.reshape(
            batch_size,
            sequence_length,
            self.num_heads,
            self.head_dimension,
        ).transpose(1, 2)

        attention_scores = (
            query @ key.transpose(-2, -1)
        ) / (self.head_dimension ** 0.5)

        attention_mask = self.causal_mask[
            :,
            :,
            :sequence_length,
            :sequence_length,
        ]

        attention_scores = attention_scores.masked_fill(
            attention_mask == 0,
            float("-inf"),
        )

        attention_weights = F.softmax(
            attention_scores,
            dim=-1,
        )

        attention_weights = self.dropout(
            attention_weights
        )

        attention_output = (
            attention_weights @ value
        )

        attention_output = (
            attention_output.transpose(1, 2)
            .contiguous()
            .reshape(
                batch_size,
                sequence_length,
                embedding_dim,
            )
        )

        return self.output_projection(
            attention_output
        )


# ============================================================
# 10. Transformer block
# ============================================================

class TransformerBlock(nn.Module):

    def __init__(
        self,
        embedding_dim: int,
        num_heads: int,
        block_size: int,
        dropout: float,
    ):
        super().__init__()

        self.attention_layer_norm = nn.LayerNorm(
            embedding_dim
        )

        self.feed_forward_layer_norm = nn.LayerNorm(
            embedding_dim
        )

        self.self_attention = CausalSelfAttention(
            embedding_dim=embedding_dim,
            num_heads=num_heads,
            block_size=block_size,
            dropout=dropout,
        )

        self.feed_forward = nn.Sequential(
            nn.Linear(
                embedding_dim,
                4 * embedding_dim,
            ),
            nn.GELU(),
            nn.Linear(
                4 * embedding_dim,
                embedding_dim,
            ),
            nn.Dropout(dropout),
        )

    def forward(
        self,
        hidden_states: torch.Tensor,
    ) -> torch.Tensor:

        hidden_states = (
            hidden_states
            + self.self_attention(
                self.attention_layer_norm(
                    hidden_states
                )
            )
        )

        hidden_states = (
            hidden_states
            + self.feed_forward(
                self.feed_forward_layer_norm(
                    hidden_states
                )
            )
        )

        return hidden_states


# ============================================================
# 11. Tiny Transformer language model
# ============================================================

class TinyTransformerLanguageModel(nn.Module):

    def __init__(
        self,
        vocabulary_size: int,
        config: ModelConfig,
    ):
        super().__init__()

        self.block_size = config.block_size

        self.token_embedding = nn.Embedding(
            vocabulary_size,
            config.embedding_dim,
        )

        self.position_embedding = nn.Embedding(
            config.block_size,
            config.embedding_dim,
        )

        self.transformer_blocks = nn.Sequential(
            *[
                TransformerBlock(
                    embedding_dim=config.embedding_dim,
                    num_heads=config.num_heads,
                    block_size=config.block_size,
                    dropout=config.dropout,
                )
                for _ in range(config.num_layers)
            ]
        )

        self.final_layer_norm = nn.LayerNorm(
            config.embedding_dim
        )

        self.language_model_head = nn.Linear(
            config.embedding_dim,
            vocabulary_size,
            bias=False,
        )

    def forward(
        self,
        input_tokens: torch.Tensor,
        target_tokens: torch.Tensor | None = None,
    ):

        batch_size, sequence_length = (
            input_tokens.shape
        )

        if sequence_length > self.block_size:
            raise ValueError(
                f"Sequence length ({sequence_length}) "
                f"cannot exceed block_size ({self.block_size})."
            )

        token_embeddings = self.token_embedding(
            input_tokens
        )

        position_indices = torch.arange(
            sequence_length,
            device=input_tokens.device,
            dtype=torch.long,
        )

        position_embeddings = self.position_embedding(
            position_indices
        ).unsqueeze(0)

        hidden_states = (
            token_embeddings
            + position_embeddings
        )

        hidden_states = self.transformer_blocks(
            hidden_states
        )

        hidden_states = self.final_layer_norm(
            hidden_states
        )

        logits = self.language_model_head(
            hidden_states
        )

        loss = None

        if target_tokens is not None:

            batch_size, sequence_length, vocabulary_size = (
                logits.shape
            )

            loss = F.cross_entropy(
                logits.reshape(
                    batch_size * sequence_length,
                    vocabulary_size,
                ),
                target_tokens.reshape(
                    batch_size * sequence_length
                ),
            )

        return logits, loss

    @torch.no_grad()
    def generate(
        self,
        input_tokens: torch.Tensor,
        max_new_tokens: int,
        temperature: float = 1.0,
        top_k: int | None = 20,
    ) -> torch.Tensor:

        if temperature <= 0:
            raise ValueError(
                "temperature must be greater than zero."
            )

        for _ in range(max_new_tokens):

            # The model can only see the most recent block_size
            # characters.
            context_tokens = input_tokens[
                :, -self.block_size :
            ]

            logits, _ = self(
                context_tokens
            )

            next_token_logits = (
                logits[:, -1, :]
                / temperature
            )

            if top_k is not None:

                vocabulary_size = (
                    next_token_logits.shape[-1]
                )

                effective_top_k = min(
                    top_k,
                    vocabulary_size,
                )

                top_values, _ = torch.topk(
                    next_token_logits,
                    k=effective_top_k,
                    dim=-1,
                )

                cutoff_value = (
                    top_values[:, -1]
                    .unsqueeze(-1)
                )

                next_token_logits = torch.where(
                    next_token_logits
                    < cutoff_value,
                    torch.full_like(
                        next_token_logits,
                        float("-inf"),
                    ),
                    next_token_logits,
                )

            probabilities = F.softmax(
                next_token_logits,
                dim=-1,
            )

            next_token = torch.multinomial(
                probabilities,
                num_samples=1,
            )

            input_tokens = torch.cat(
                [
                    input_tokens,
                    next_token,
                ],
                dim=1,
            )

        return input_tokens


# ============================================================
# 12. Loss estimation
# ============================================================

@torch.no_grad()
def estimate_loss(
    model: TinyTransformerLanguageModel,
    get_batch,
    evaluation_steps: int,
) -> dict[str, float]:

    model.eval()

    estimated_losses = {}

    for split in (
        "train",
        "validation",
    ):

        losses = []

        for _ in range(evaluation_steps):

            input_batch, target_batch = get_batch(
                split
            )

            _, loss = model(
                input_batch,
                target_batch,
            )

            losses.append(loss.item())

        estimated_losses[split] = (
            sum(losses) / len(losses)
        )

    model.train()

    return estimated_losses


# ============================================================
# 13. Training loop
# ============================================================

def train_model(
    model: TinyTransformerLanguageModel,
    get_batch,
    maximum_steps: int,
    evaluation_interval: int,
    evaluation_steps: int,
    learning_rate: float,
    gradient_clip: float,
) -> None:

    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=learning_rate,
    )

    model.train()

    for training_step in range(maximum_steps):

        if (
            training_step % evaluation_interval == 0
        ):

            loss_report = estimate_loss(
                model=model,
                get_batch=get_batch,
                evaluation_steps=evaluation_steps,
            )

            print(
                f"step {training_step:6d} | "
                f"train loss {loss_report['train']:.4f} | "
                f"val loss {loss_report['validation']:.4f}"
            )

        input_batch, target_batch = get_batch(
            "train"
        )

        _, loss = model(
            input_batch,
            target_batch,
        )

        optimizer.zero_grad(
            set_to_none=True
        )

        loss.backward()

        torch.nn.utils.clip_grad_norm_(
            model.parameters(),
            gradient_clip,
        )

        optimizer.step()


# ============================================================
# 14. Text sampling
# ============================================================

@torch.no_grad()
def sample_text(
    model: TinyTransformerLanguageModel,
    prompt: str,
    character_to_index: dict[str, int],
    index_to_character: dict[int, str],
    device: torch.device,
    max_new_tokens: int,
    temperature: float,
    top_k: int | None,
) -> str:

    model.eval()

    unknown_characters = sorted(
        set(prompt) - set(character_to_index)
    )

    if unknown_characters:

        escaped_characters = [
            repr(character)
            for character in unknown_characters
        ]

        raise ValueError(
            "The prompt contains characters that do not "
            "exist in the training vocabulary: "
            + ", ".join(escaped_characters)
        )

    prompt_token_ids = torch.tensor(
        [
            [
                character_to_index[character]
                for character in prompt
            ]
        ],
        dtype=torch.long,
        device=device,
    )

    generated_token_ids = model.generate(
        input_tokens=prompt_token_ids,
        max_new_tokens=max_new_tokens,
        temperature=temperature,
        top_k=top_k,
    )

    return decode_tokens(
        generated_token_ids[0].cpu(),
        index_to_character,
    )


# ============================================================
# 15. Checkpoint saving
# ============================================================

def save_checkpoint(
    model: TinyTransformerLanguageModel,
    file_path: Path,
    character_to_index: dict[str, int],
    index_to_character: dict[int, str],
    config: ModelConfig,
) -> None:

    file_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    checkpoint = {
        "model_state_dict": model.state_dict(),
        "character_to_index": character_to_index,
        "index_to_character": index_to_character,
        "model_config": {
            "block_size": config.block_size,
            "embedding_dim": config.embedding_dim,
            "num_heads": config.num_heads,
            "num_layers": config.num_layers,
            "dropout": config.dropout,
        },
    }

    torch.save(
        checkpoint,
        file_path,
    )

    print(
        f"Checkpoint saved to: {file_path}"
    )


# ============================================================
# 16. Main program
# ============================================================

def main() -> None:

    parser = argparse.ArgumentParser(
        description=(
            "Train a tiny character-level "
            "Transformer language model."
        )
    )

    # --------------------------------------------------------
    # Input/output
    # --------------------------------------------------------

    parser.add_argument(
        "--input_file",
        type=str,
        required=True,
        help="Path to the UTF-8 training text file.",
    )

    parser.add_argument(
        "--save_model",
        type=str,
        default="",
        help="Optional path for saving the checkpoint.",
    )

    # --------------------------------------------------------
    # Hardware
    # --------------------------------------------------------

    parser.add_argument(
        "--device",
        type=str,
        choices=[
            "auto",
            "mps",
            "cuda",
            "cpu",
        ],
        default="auto",
        help=(
            "Compute device. "
            "Default: automatic MPS -> CUDA -> CPU selection."
        ),
    )

    # --------------------------------------------------------
    # Training
    # --------------------------------------------------------

    parser.add_argument(
        "--max_steps",
        type=int,
        default=5000,
        help="Number of training steps.",
    )

    parser.add_argument(
        "--batch_size",
        type=int,
        default=32,
    )

    parser.add_argument(
        "--learning_rate",
        type=float,
        default=3e-4,
    )

    parser.add_argument(
        "--evaluation_interval",
        type=int,
        default=500,
    )

    parser.add_argument(
        "--evaluation_steps",
        type=int,
        default=50,
    )

    parser.add_argument(
        "--gradient_clip",
        type=float,
        default=1.0,
    )

    # --------------------------------------------------------
    # Model
    # --------------------------------------------------------

    parser.add_argument(
        "--block_size",
        type=int,
        default=128,
    )

    parser.add_argument(
        "--embedding_dim",
        type=int,
        default=128,
    )

    parser.add_argument(
        "--num_heads",
        type=int,
        default=4,
    )

    parser.add_argument(
        "--num_layers",
        type=int,
        default=4,
    )

    parser.add_argument(
        "--dropout",
        type=float,
        default=0.1,
    )

    # --------------------------------------------------------
    # Sampling
    # --------------------------------------------------------

    parser.add_argument(
        "--sample_prompt",
        type=str,
        default="The ",
    )

    parser.add_argument(
        "--sample_tokens",
        type=int,
        default=300,
    )

    parser.add_argument(
        "--temperature",
        type=float,
        default=1.0,
    )

    parser.add_argument(
        "--top_k",
        type=int,
        default=20,
    )

    # --------------------------------------------------------
    # Reproducibility
    # --------------------------------------------------------

    parser.add_argument(
        "--seed",
        type=int,
        default=1337,
    )

    args = parser.parse_args()

    # ========================================================
    # Initialization
    # ========================================================

    set_seed(args.seed)

    # Make float32 the explicit default floating-point type.
    #
    # Token IDs remain torch.long.
    #
    # This is particularly important for MPS because current
    # PyTorch MPS does not support float64 tensors.
    torch.set_default_dtype(torch.float32)

    device = get_device(
        args.device
    )

    print(
        f"PyTorch version : {torch.__version__}"
    )

    print(
        f"Device          : {device}"
    )

    print(
        f"Default dtype   : {torch.get_default_dtype()}"
    )

    # ========================================================
    # Load data
    # ========================================================

    input_file_path = Path(
        args.input_file
    )

    text = load_text(
        input_file_path
    )

    print(
        f"Loaded          : {len(text):,} characters"
    )

    # ========================================================
    # Build vocabulary
    # ========================================================

    (
        vocabulary_size,
        character_to_index,
        index_to_character,
    ) = build_vocabulary(text)

    print(
        f"Vocabulary size : {vocabulary_size}"
    )

    # ========================================================
    # Encode text
    # ========================================================

    token_data = encode_text(
        text,
        character_to_index,
    )

    print(
        f"Token tensor    : {token_data.shape}"
    )

    # ========================================================
    # Train / validation split
    # ========================================================

    train_data, validation_data = split_dataset(
        token_data
    )

    print(
        f"Training tokens : {len(train_data):,}"
    )

    print(
        f"Validation tokens : {len(validation_data):,}"
    )

    # ========================================================
    # Validate dataset size
    # ========================================================

    if len(train_data) <= args.block_size:
        raise ValueError(
            "Training text is too small for the selected "
            f"block_size={args.block_size}."
        )

    if len(validation_data) <= args.block_size:
        raise ValueError(
            "Validation text is too small for the selected "
            f"block_size={args.block_size}."
        )

    # ========================================================
    # Create batch loader
    # ========================================================

    get_batch = create_batch_loader(
        train_data=train_data,
        validation_data=validation_data,
        block_size=args.block_size,
        batch_size=args.batch_size,
        device=device,
    )

    # ========================================================
    # Create model configuration
    # ========================================================

    model_config = ModelConfig(
        block_size=args.block_size,
        embedding_dim=args.embedding_dim,
        num_heads=args.num_heads,
        num_layers=args.num_layers,
        dropout=args.dropout,
    )

    # ========================================================
    # Create Transformer
    # ========================================================

    model = TinyTransformerLanguageModel(
        vocabulary_size=vocabulary_size,
        config=model_config,
    )

    # Explicitly enforce float32 before moving to hardware.
    model = model.float()

    # Move all model parameters and buffers to MPS/CUDA/CPU.
    model = model.to(device)

    total_parameters = sum(
        parameter.numel()
        for parameter in model.parameters()
    )

    print(
        f"Parameters     : {total_parameters:,}"
    )

    # ========================================================
    # Train
    # ========================================================

    train_model(
        model=model,
        get_batch=get_batch,
        maximum_steps=args.max_steps,
        evaluation_interval=args.evaluation_interval,
        evaluation_steps=args.evaluation_steps,
        learning_rate=args.learning_rate,
        gradient_clip=args.gradient_clip,
    )

    # ========================================================
    # Save checkpoint
    # ========================================================

    if args.save_model:

        save_checkpoint(
            model=model,
            file_path=Path(
                args.save_model
            ),
            character_to_index=character_to_index,
            index_to_character=index_to_character,
            config=model_config,
        )

    # ========================================================
    # Generate text
    # ========================================================

    generated_text = sample_text(
        model=model,
        prompt=args.sample_prompt,
        character_to_index=character_to_index,
        index_to_character=index_to_character,
        device=device,
        max_new_tokens=args.sample_tokens,
        temperature=args.temperature,
        top_k=args.top_k,
    )

    print()
    print("=" * 70)
    print("GENERATED TEXT")
    print("=" * 70)
    print()
    print(generated_text)


# ============================================================
# 17. Script entry point
# ============================================================

if __name__ == "__main__":
    main()
