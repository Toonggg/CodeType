/**
 * Built-in practice snippets, excerpted verbatim from the named open-source files.
 * This array is the single source of truth: the source <select> options are
 * generated from it at boot (Q7).
 *
 * Fields: id (stable, used for history), label (menu text), language (a key of
 * LANGUAGES in syntax/languages.js), repo and path (shown in the card header),
 * code (the text to type).
 */
export const EXAMPLES = [
  {
    id: "python-stdlib",
    label: "Python · asyncio runner",
    language: "python",
    repo: "cpython",
    path: "/ Lib / asyncio / runners.py",
    code: 'def run(main, *, debug=None):\n    """Execute the coroutine and return the result.\n\n    This function runs the passed coroutine, taking care of managing the\n    asyncio event loop, finalizing asynchronous generators, and closing the\n    default executor.\n    """\n    with Runner(debug=debug) as runner:\n        return runner.run(main)',
  },
  {
    id: "python-requests",
    label: "Python · Requests session",
    language: "python",
    repo: "psf/requests",
    path: "/ src / requests / sessions.py",
    code: 'def send(self, request, **kwargs):\n    """Send a PreparedRequest.\n\n    :param request: The PreparedRequest being sent.\n    :param stream: (optional) Whether to stream the request content.\n    """\n    adapter = self.get_adapter(url=request.url)\n    start = preferred_clock()\n    r = adapter.send(request, **kwargs)\n    elapsed = preferred_clock() - start\n    r.elapsed = timedelta(seconds=elapsed)\n    return r',
  },
  {
    id: "cpp-stdlib",
    label: "C++ · libc++ algorithm",
    language: "cpp",
    repo: "llvm-project",
    path: "/ libcxx / include / algorithm",
    code: "template <class _InputIterator, class _OutputIterator>\n_LIBCPP_CONSTEXPR_SINCE_CXX20\n_OutputIterator copy(_InputIterator __first,\n                     _InputIterator __last,\n                     _OutputIterator __result) {\n  for (; __first != __last; ++__first, ++__result)\n    *__result = *__first;\n  return __result;\n}",
  },
  {
    id: "rust-stdlib",
    label: "Rust · UTF-8 strings",
    language: "rust",
    repo: "rust-lang/rust",
    path: "/ library / alloc / string.rs",
    code: "pub fn from_utf8(v: Vec<u8>) -> Result<String, FromUtf8Error> {\n    match str::from_utf8(&v) {\n        Ok(_) => Ok(String { vec: v }),\n        Err(e) => Err(FromUtf8Error { bytes: v, error: e }),\n    }\n}\n\npub fn into_bytes(self) -> Vec<u8> {\n    self.vec\n}",
  },
  {
    id: "js-left-pad",
    label: "JavaScript · left-pad",
    language: "javascript",
    repo: "left-pad/left-pad",
    path: "/ index.js",
    code: "function leftPad (str, len, ch) {\n  // convert `str` to a `string`\n  str = str + '';\n  // `len` is the `pad`'s length now\n  len = len - str.length;\n  // doesn't need to pad\n  if (len <= 0) return str;\n  // `ch` defaults to `' '`\n  if (!ch && ch !== 0) ch = ' ';\n  // convert `ch` to a `string` cuz it could be a number\n  ch = ch + '';\n  // cache common use cases\n  if (ch === ' ' && len < 10) return cache[len] + str;\n  // `pad` starts with an empty string\n  var pad = '';\n  // loop\n  while (true) {\n    // add `ch` to `pad` if `len` is odd\n    if (len & 1) pad += ch;\n    // divide `len` by 2, ditch the remainder\n    len >>= 1;\n    // \"double\" the `ch` so this operation count grows logarithmically on `len`\n    // each time `ch` is \"doubled\", the `len` would need to be \"doubled\" too\n    // similar to finding a value in binary search tree, hence O(log(n))\n    if (len) ch += ch;\n    // `len` is 0, exit the loop\n    else break;\n  }\n  // pad `str`!\n  return pad + str;\n}",
  },
  {
    id: "ts-vscode-arrays",
    label: "TypeScript · VS Code arrays",
    language: "typescript",
    repo: "microsoft/vscode",
    path: "/ src / vs / base / common / arrays.ts",
    code: "export function tail<T>(arr: T[]): [T[], T] {\n\tif (arr.length === 0) {\n\t\tthrow new Error('Invalid tail call');\n\t}\n\n\treturn [arr.slice(0, arr.length - 1), arr[arr.length - 1]];\n}\n\n/**\n * @returns New array with all falsy values removed. The original array IS NOT modified.\n */\nexport function coalesce<T>(array: ReadonlyArray<T | undefined | null>): T[] {\n\treturn array.filter((e): e is T => !!e);\n}",
  },
  {
    id: "go-strings",
    label: "Go · strings.Contains",
    language: "go",
    repo: "golang/go",
    path: "/ src / strings / strings.go",
    code: "// Contains reports whether substr is within s.\nfunc Contains(s, substr string) bool {\n\treturn Index(s, substr) >= 0\n}\n\n// ContainsAny reports whether any Unicode code points in chars are within s.\nfunc ContainsAny(s, chars string) bool {\n\treturn IndexAny(s, chars) >= 0\n}\n\n// ContainsRune reports whether the Unicode code point r is within s.\nfunc ContainsRune(s string, r rune) bool {\n\treturn IndexRune(s, r) >= 0\n}",
  },
  {
    id: "java-objects",
    label: "Java · java.util.Objects",
    language: "java",
    repo: "openjdk/jdk",
    path: "/ src / java.base / share / classes / java / util / Objects.java",
    code: "public static boolean equals(Object a, Object b) {\n    return (a == b) || (a != null && a.equals(b));\n}\n\n@ForceInline\npublic static <T> T requireNonNull(T obj) {\n    if (obj == null)\n        throw new NullPointerException();\n    return obj;\n}",
  },
  {
    id: "shell-rustup",
    label: "Shell · rustup installer",
    language: "shell",
    repo: "rust-lang/rustup",
    path: "/ rustup-init.sh",
    code: 'say() {\n    if [ "$RUSTUP_QUIET" = "no" ]; then\n        __print \'info\' "$1" >&2\n    fi\n}\n\n# NOTE: you are required to exit yourself\n# we don\'t do it here because of multiline errors\nerr() {\n    __print \'error\' "$1" >&2\n}\n\nneed_cmd() {\n    if ! check_cmd "$1"; then\n        err "need \'$1\' (command not found)"\n        exit 1\n    fi\n}\n\ncheck_cmd() {\n    command -v "$1" > /dev/null 2>&1\n}',
  },
];
