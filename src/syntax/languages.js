/**
 * Languages: display metadata, file-name detection and syntax rule sets.
 *
 * Tokenizer contract: every rule is a [tokenType, RegExp] or [tokenType, { start, end }]
 * pair (or an array of them). The tokenizer (tokenize.js) scans left to right;
 * the earliest match wins, ties go to the longest match and then to the rule listed
 * first. Rules therefore do not need to guard against each other: a `#` inside a
 * string is consumed by the string rule before the comment rule can see it.
 *
 * Token types map to CSS classes `syntax-<type>`: comment, string, keyword,
 * literal, type, number, function, decorator, preprocessor, macro, variable.
 */

/** Builds a whole-word regex from a space-separated word list. */
const words = (list) => new RegExp(`\\b(?:${list.trim().split(/\s+/).join("|")})\\b`, "g");

// Shared building blocks.
const SLASH_COMMENT = [
  ["comment", /\/\/[^\n]*/g],
  ["comment", { start: /\/\*/g, end: "*/" }],
];
const HASH_COMMENT = ["comment", /#[^\n]*/g];
/** Single-line strings; an unterminated quote does not swallow the rest of the file. */
const DOUBLE_STRING = ["string", /"(?:\\[\s\S]|[^"\\\n])*"/g];
const SINGLE_STRING = ["string", /'(?:\\[\s\S]|[^'\\\n])*'/g];
const NUMBER = [
  "number",
  /\b(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?)[A-Za-z_]*\b/g,
];
const FUNCTION_CALL = ["function", /\b[A-Za-z_$][\w$]*(?=\s*\()/g];
const ANNOTATION = ["decorator", /@[A-Za-z_][\w.]*/g];

const JS_KEYWORDS = `
  async await break case catch class const continue debugger default delete do else export
  extends finally for from function if import in instanceof let new of return static super
  switch this throw try typeof var void while with yield`;
const JS_LITERALS = "true false null undefined NaN Infinity";
const JS_TYPES = `
  Array ArrayBuffer BigInt Boolean Date Error Function JSON Map Math Number Object Promise
  Proxy Reflect RegExp Set String Symbol WeakMap WeakSet`;
const TEMPLATE_STRING = ["string", /`(?:\\[\s\S]|[^`\\])*`/g];

export const SYNTAX_RULES = {
  python: [
    HASH_COMMENT,
    ["string", { start: /(?:\b[rRbBuUfF]{1,2})?"""/g, end: '"""' }],
    ["string", { start: /(?:\b[rRbBuUfF]{1,2})?'''/g, end: "'''" }],
    ["string", /(?:\b[rRbBuUfF]{1,2})?(?:"(?:\\[\s\S]|[^"\\\n])*"|'(?:\\[\s\S]|[^'\\\n])*')/g],
    ["decorator", /@[A-Za-z_][\w.]*/g],
    [
      "keyword",
      words(`
        and as assert async await break case class continue def del elif else except finally
        for from global if import in is lambda match nonlocal not or pass raise return try
        while with yield`),
    ],
    ["literal", words("False None True self cls")],
    [
      "type",
      words(`
        Any Callable Dict Iterable Iterator List Optional Sequence Set Tuple Type Union bool
        bytearray bytes complex dict float frozenset int list object set str tuple`),
    ],
    NUMBER,
    FUNCTION_CALL,
  ],
  cpp: [
    SLASH_COMMENT,
    DOUBLE_STRING,
    SINGLE_STRING,
    ["preprocessor", /^[ \t]*#[ \t]*[A-Za-z_]\w*[^\n]*/gm],
    [
      "keyword",
      words(`
        alignas alignof auto break case catch class co_await co_return co_yield concept const
        const_cast consteval constexpr constinit continue decltype default delete do
        dynamic_cast else enum explicit export extern final for friend goto if inline mutable
        namespace new noexcept operator override private protected public register
        reinterpret_cast requires return sizeof static static_assert static_cast struct switch
        template this thread_local throw try typedef typeid typename union using virtual void
        volatile while`),
    ],
    ["literal", words("false nullptr true NULL")],
    [
      "type",
      words(`
        allocator bool char char8_t char16_t char32_t double float int int8_t int16_t int32_t
        int64_t long ptrdiff_t short signed size_t string uint8_t uint16_t uint32_t uint64_t
        unsigned vector wchar_t`),
    ],
    NUMBER,
    FUNCTION_CALL,
  ],
  rust: [
    SLASH_COMMENT,
    ["string", /b?r(#*)"[\s\S]*?"\1|b?"(?:\\[\s\S]|[^"\\])*"/g],
    // Character literals; lifetimes such as 'a have no closing quote and are skipped.
    ["string", /b?'(?:\\(?:x[\da-fA-F]{2}|u\{[\da-fA-F]{1,6}\}|.)|[^'\\\n])'/g],
    ["decorator", /#!?\[[^\]\n]*\]/g],
    ["macro", /\b[A-Za-z_]\w*!(?=\s*[([{])/g],
    [
      "keyword",
      words(`
        as async await break const continue crate dyn else enum extern fn for if impl in let
        loop match mod move mut pub ref return self Self static struct super trait type unsafe
        use where while`),
    ],
    ["literal", words("false true None Some Ok Err")],
    [
      "type",
      words(`
        Box HashMap Option Rc Result String Vec bool char f32 f64 i8 i16 i32 i64 i128 isize str
        u8 u16 u32 u64 u128 usize`),
    ],
    NUMBER,
    FUNCTION_CALL,
  ],
  javascript: [
    SLASH_COMMENT,
    TEMPLATE_STRING,
    DOUBLE_STRING,
    SINGLE_STRING,
    ANNOTATION,
    ["keyword", words(JS_KEYWORDS)],
    ["literal", words(JS_LITERALS)],
    ["type", words(JS_TYPES)],
    NUMBER,
    FUNCTION_CALL,
  ],
  typescript: [
    SLASH_COMMENT,
    TEMPLATE_STRING,
    DOUBLE_STRING,
    SINGLE_STRING,
    ANNOTATION,
    [
      "keyword",
      words(`${JS_KEYWORDS}
        abstract as asserts declare enum implements infer interface is keyof namespace
        override private protected public readonly satisfies type unique`),
    ],
    ["literal", words(JS_LITERALS)],
    [
      "type",
      words(`${JS_TYPES}
        any bigint boolean never number object string symbol unknown Omit Partial Pick
        Readonly ReadonlyArray Record Required`),
    ],
    NUMBER,
    FUNCTION_CALL,
  ],
  go: [
    SLASH_COMMENT,
    ["string", /`[^`]*`/g],
    DOUBLE_STRING,
    SINGLE_STRING,
    [
      "keyword",
      words(`
        break case chan const continue default defer else fallthrough for func go goto if
        import interface map package range return select struct switch type var`),
    ],
    ["literal", words("true false nil iota")],
    [
      "type",
      words(`
        any bool byte comparable complex64 complex128 error float32 float64 int int8 int16
        int32 int64 rune string uint uint8 uint16 uint32 uint64 uintptr`),
    ],
    NUMBER,
    FUNCTION_CALL,
  ],
  java: [
    SLASH_COMMENT,
    ["string", { start: /"""/g, end: '"""' }],
    DOUBLE_STRING,
    SINGLE_STRING,
    ANNOTATION,
    [
      "keyword",
      words(`
        abstract assert break case catch class const continue default do else enum extends
        final finally for goto if implements import instanceof interface native new non-sealed
        package permits private protected public record return sealed static strictfp super
        switch synchronized this throw throws transient try var volatile while yield`),
    ],
    ["literal", words("true false null")],
    [
      "type",
      words(`
        Boolean Double Integer List Long Map Object Optional Set String boolean byte char
        double float int long short void`),
    ],
    NUMBER,
    FUNCTION_CALL,
  ],
  shell: [
    // A # starts a comment only at the start of a word ($#, ${#x} are not comments).
    ["comment", /(?<![^\s;|&(])#[^\n]*/g],
    ["string", /"(?:\\[\s\S]|[^"\\])*"/g],
    ["string", /'[^']*'/g],
    ["variable", /\$(?:\{[^}\n]*\}|[A-Za-z_]\w*|[\d#?@*$!-])/g],
    [
      "keyword",
      words(`
        if then else elif fi for while until do done case esac in function return local export
        readonly declare select break continue exit shift set unset trap source eval exec`),
    ],
    ["function", words("echo printf command cd test read pwd type exit")],
    NUMBER,
    ["function", /\b[A-Za-z_][\w-]*(?=\s*\(\s*\))/g],
  ],
  generic: [
    ["comment", /#[^\n]*/g],
    SLASH_COMMENT,
    DOUBLE_STRING,
    SINGLE_STRING,
    [
      "keyword",
      words(`
        class const def else for fn function if import let new public return static struct
        var void while`),
    ],
    ["literal", words("false null true None nil")],
    NUMBER,
    FUNCTION_CALL,
  ],
};

/** Display metadata: the short badge shown in the card header. */
export const LANGUAGES = {
  python: { name: "Python", badge: "PY" },
  cpp: { name: "C/C++", badge: "C++" },
  rust: { name: "Rust", badge: "RS" },
  javascript: { name: "JavaScript", badge: "JS" },
  typescript: { name: "TypeScript", badge: "TS" },
  go: { name: "Go", badge: "GO" },
  java: { name: "Java", badge: "JV" },
  shell: { name: "Shell", badge: "SH" },
  generic: { name: "Plain text", badge: "{ }" },
};

const EXTENSIONS = {
  python: "py pyw pyi",
  cpp: "c cc cpp cxx c++ h hh hpp hxx ino",
  rust: "rs",
  javascript: "js mjs cjs jsx",
  typescript: "ts mts cts tsx",
  go: "go",
  java: "java",
  shell: "sh bash zsh ksh",
};

const EXTENSION_MAP = new Map(
  Object.entries(EXTENSIONS).flatMap(([language, list]) =>
    list.split(" ").map((extension) => [extension, language]),
  ),
);

/** Well-known file names without a useful extension. */
const FILE_NAMES = new Map([
  [".bashrc", "shell"],
  [".bash_profile", "shell"],
  [".profile", "shell"],
  [".zshrc", "shell"],
  [".zprofile", "shell"],
  ["pkgbuild", "shell"],
]);

/** Detects the language from a file name or path; "generic" when unknown. */
export function detectLanguage(name = "") {
  const base = String(name).split(/[\\/]/).pop().trim().toLowerCase();
  if (FILE_NAMES.has(base)) return FILE_NAMES.get(base);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "generic";
  return EXTENSION_MAP.get(base.slice(dot + 1)) ?? "generic";
}
