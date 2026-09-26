# CodeType

Typing practice for developers. Type real code from well-known open-source projects, or import
your own file, and track speed and accuracy as you go.

## Run it

Requires Node.js 20 or newer.

```sh
npm install
npm run dev
```

Open the printed local URL in a browser.

## Test and lint

```sh
npm test
npm run lint
```

## Build

```sh
npm run build     # static site in dist/
npm run preview   # serve dist/ locally
```

## Syntax highlighting

Highlighting uses a small built-in tokenizer (`src/syntax/tokenize.js`) with rule sets for
Python, C/C++, Rust, JavaScript, TypeScript, Go, Java and shell (`src/syntax/languages.js`).
Other files fall back to a generic rule set.

Decision (D3): the custom tokenizer was extended rather than adopting Prism. It keeps the app
dependency-free and is enough for a handful of languages. Revisit this if more than about six
more languages are wanted.
