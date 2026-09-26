/**
 * Built-in practice snippets. This array is the single source of truth: the source
 * <select> options are generated from it at boot (Q7).
 */
export const EXAMPLES = [
  {
    id: "python-stdlib",
    label: "Python · asyncio runner",
    language: "python",
    repo: "cpython",
    path: "/ Lib / asyncio / runners.py",
    icon: "⌘",
    code: `def run(main, *, debug=None):\n    """Execute the coroutine and return the result.\n\n    This function runs the passed coroutine, taking care of managing the\n    asyncio event loop, finalizing asynchronous generators, and closing the\n    default executor.\n    """\n    with Runner(debug=debug) as runner:\n        return runner.run(main)`,
  },
  {
    id: "python-requests",
    label: "Python · Requests session",
    language: "python",
    repo: "psf/requests",
    path: "/ src / requests / sessions.py",
    icon: "◈",
    code: `def send(self, request, **kwargs):\n    """Send a PreparedRequest.\n\n    :param request: The PreparedRequest being sent.\n    :param stream: (optional) Whether to stream the request content.\n    """\n    adapter = self.get_adapter(url=request.url)\n    start = preferred_clock()\n    r = adapter.send(request, **kwargs)\n    elapsed = preferred_clock() - start\n    r.elapsed = timedelta(seconds=elapsed)\n    return r`,
  },
  {
    id: "cpp-stdlib",
    label: "C++ · libc++ algorithm",
    language: "cpp",
    repo: "llvm-project",
    path: "/ libcxx / include / algorithm",
    icon: "◆",
    code: `template <class _InputIterator, class _OutputIterator>\n_LIBCPP_CONSTEXPR_SINCE_CXX20\n_OutputIterator copy(_InputIterator __first,\n                     _InputIterator __last,\n                     _OutputIterator __result) {\n  for (; __first != __last; ++__first, ++__result)\n    *__result = *__first;\n  return __result;\n}`,
  },
  {
    id: "rust-stdlib",
    label: "Rust · UTF-8 strings",
    language: "rust",
    repo: "rust-lang/rust",
    path: "/ library / alloc / string.rs",
    icon: "⚙",
    code: `pub fn from_utf8(v: Vec<u8>) -> Result<String, FromUtf8Error> {\n    match str::from_utf8(&v) {\n        Ok(_) => Ok(String { vec: v }),\n        Err(e) => Err(FromUtf8Error { bytes: v, error: e }),\n    }\n}\n\npub fn into_bytes(self) -> Vec<u8> {\n    self.vec\n}`,
  },
];
