# Contributing to flowstate

Thank you for your interest in contributing! Before submitting a pull request, you **must** read and understand our [IDEOLOGY.md](docs/IDEOLOGY.md). 

## Architecture

This project uses a three-layer architecture:
1. **React Webview**: The frontend interface (in `src/`).
2. **Node Sidecar**: The background agent host (in `sidecar/`).
3. **Rust Host**: The native Tauri application and system integration (in `src-tauri/`).

## Design Laws

Features that fight the design laws and principles established in the ideology document will be asked to be redesigned before merge. Please ensure your contributions align with the core philosophy of the project.
