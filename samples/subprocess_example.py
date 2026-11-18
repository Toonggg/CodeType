from pathlib import Path
import subprocess
import logging
from datetime import datetime

# ---------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------

input_directory = Path("raw_data")
output_directory = Path("processed_data")
log_directory = Path("logs")

output_directory.mkdir(exist_ok=True)
log_directory.mkdir(exist_ok=True)

log_file = log_directory / f"pipeline_{datetime.now():%Y%m%d_%H%M%S}.log"

logging.basicConfig(
    filename=log_file,
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------
# External command
# ---------------------------------------------------------------------

def process_file(input_file: Path, output_file: Path) -> bool:
    """
    Run an external command safely.

    Returns
    -------
    bool
        True if successful.
    """

    command = [
        "python",
        "external_processing_script.py",
        "--input",
        str(input_file),
        "--output",
        str(output_file),
    ]

    logger.info("Running: %s", " ".join(command))

    try:
        completed_process = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=True,
        )

        logger.info(
            "Finished %s\nstdout:\n%s",
            input_file.name,
            completed_process.stdout.strip(),
        )

        return True

    except subprocess.CalledProcessError as error:

        logger.error(
            "FAILED: %s\nExit code: %d\nstdout:\n%s\nstderr:\n%s",
            input_file.name,
            error.returncode,
            error.stdout,
            error.stderr,
        )

        return False


# ---------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------

successful = 0
failed = 0

for input_file in sorted(input_directory.glob("*.csv")):

    output_file = output_directory / input_file.name

    if process_file(input_file, output_file):
        successful += 1
    else:
        failed += 1

logger.info("-" * 60)
logger.info("Completed")
logger.info("Successful : %d", successful)
logger.info("Failed     : %d", failed)

print(f"Successful: {successful}")
print(f"Failed    : {failed}")
print(f"Log file  : {log_file}")