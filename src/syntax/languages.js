/**
 * Syntax rule sets per language and file-extension detection.
 * Each rule is a [tokenType, globalRegExp] pair.
 */

/** Builds a whole-word regex from a space-separated word list. */
const words = (list) => new RegExp(`\\b(?:${list.trim().split(/\s+/).join("|")})\\b`, "g");

const COMMON = {
  slashComment: ["comment", /\/\/[^\n]*|\/\*[\s\S]*?\*\//g],
  quotedString: ["string", /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g],
  number: ["number", /\b\d+(?:\.\d+)?\b/g],
  functionCall: ["function", /\b[A-Za-z_]\w*(?=\s*\()/g],
};

export const SYNTAX_RULES = {
  python: [
    ["comment", /#[^\n]*/g],
    ["string", /("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g],
    ["decorator", /@[A-Za-z_]\w*/g],
    [
      "keyword",
      words(`
        and as assert async await break class continue def del elif else except finally for
        from if import in is lambda match not or pass raise return try while with yield
      `),
    ],
    ["literal", words(`False None True`)],
    [
      "type",
      words(`
        Any Callable Dict Iterable List Optional Set Tuple Type bool bytes dict float int
        list object set str tuple
      `),
    ],
    COMMON.number,
    COMMON.functionCall,
  ],
  cpp: [
    COMMON.slashComment,
    COMMON.quotedString,
    ["preprocessor", /^\s*#\s*\w+.*$/gm],
    [
      "keyword",
      words(`
        alignas auto break case catch class const constexpr continue decltype default delete
        else enum explicit export extern for friend if inline namespace new operator private
        protected public return sizeof static struct switch template this throw try typedef
        typename using virtual void while
      `),
    ],
    ["literal", words(`false nullptr true`)],
    ["type", words(`allocator bool char double float int long size_t string unsigned vector`)],
    COMMON.number,
    COMMON.functionCall,
  ],
  rust: [
    COMMON.slashComment,
    ["string", /"(?:\\.|[^"\\])*"/g],
    ["macro", /\b[A-Za-z_]\w*!(?=\s*\()/g],
    [
      "keyword",
      words(`
        as async await break const continue crate dyn else enum extern fn for if impl in let
        loop match mod move mut pub ref return self Self static struct super trait type
        unsafe use where while
      `),
    ],
    ["literal", words(`false None Some true`)],
    ["type", words(`Result String Vec bool char f32 f64 i32 i64 str u32 u64 usize`)],
    COMMON.number,
    COMMON.functionCall,
  ],
  generic: [
    ["comment", /#[^\n]*|\/\/[^\n]*|\/\*[\s\S]*?\*\//g],
    COMMON.quotedString,
    [
      "keyword",
      words(`
        class const def else for fn function if import let new public return static struct
        var void while
      `),
    ],
    ["literal", words(`false null true None nil`)],
    COMMON.number,
    COMMON.functionCall,
  ],
};

export function detectLanguage(filename) {
  const extension = filename.toLowerCase().split(".").pop();
  if (["py", "pyw"].includes(extension)) return "python";
  if (["c", "cc", "cpp", "cxx", "h", "hpp"].includes(extension)) return "cpp";
  if (extension === "rs") return "rust";
  return "generic";
}
