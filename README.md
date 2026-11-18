# CodeType

Typing practice for developers. Type real code excerpted from well-known open-source projects, or import your own files, and track typing speed (WPM) and accuracy in real time.

Built with plain HTML, CSS, and modern JavaScript modules—no framework and zero runtime dependencies.

## Quick start

Requires Node.js 22.13+, 24.x, or 26+.

```sh
npm install
npm run dev
```

The app will open automatically in your browser.

## Commands

```sh
npm test              # Run unit tests with Vitest
npm run lint          # Lint source files with ESLint
npm run format:check  # Check formatting with Prettier (npm run format to fix)
npm run build         # Build production bundle to dist/
npm run preview       # Preview production build locally
```

## Features

- **Real code snippets**: Built-in excerpts from popular open-source repositories in Python, C/C++, Rust, JavaScript, TypeScript, Go, Java, and Shell.
- **Custom imports**: Practice on your own files via local upload or public GitHub links (with support for `#L` line ranges, capped to 400 lines or 20,000 characters).
- **Realistic typing ergonomics**: Strict whitespace checking, smart `Tab` for indentation, optional auto-indent, comment skipping, and random start positions.
- **Performance stats**: Live tracking of WPM (calculated from user-typed keystrokes), accuracy, errors, and backspaces, with localStorage history and personal bests.
- **Accessible & customizable**: Full keyboard navigation, screen reader support, light/dark themes, and reduced-motion mode.

## Keyboard shortcuts

| Key                | Context     | Action                                                |
| ------------------ | ----------- | ----------------------------------------------------- |
| `Tab`              | Typing area | Insert expected indentation (or move focus when idle) |
| `Shift + Tab`      | Typing area | Move focus out (pauses active run)                    |
| `Esc`              | Anywhere    | Close Options menu, cancel countdown, or pause/resume |
| `Esc Esc`          | Active run  | Quick restart                                         |
| `Ctrl/Cmd + Enter` | Anywhere    | Restart and focus the typing area                     |
