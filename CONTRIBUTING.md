# Contributing to Cloudflare Updater

Thank you for your interest in contributing! This document outlines the process and guidelines for contributing to this project.

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/cloudflare-updater.git
   cd cloudflare-updater
   ```
3. Install dependencies:
   ```bash
   pnpm install
   ```
4. Create a new branch for your changes:
   ```bash
   git checkout -b feat/your-feature-name
   ```

## Development Workflow

### Running Locally

```bash
# Run in development mode
pnpm dev

# Build the project
pnpm build

# Run the built version
pnpm start
```

### Code Quality

Before submitting your changes, ensure they pass our quality checks:

```bash
# Lint your code
pnpm lint

# Fix linting issues automatically
pnpm lint:fix

# Check formatting
pnpm format:check

# Format code
pnpm format
```

### Testing

Run the application locally to verify your changes work as expected. Test both:

- Interactive mode (prompts and menus)
- Non-interactive mode (environment variables)

## Commit Convention

Before you create a Pull Request, please make sure your commit message follows the [Conventional Commits](https://www.conventionalcommits.org/) specification.

### Commit Message Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Type

Must be one of the following:

- **feat**: A new feature
- **fix**: A bug fix
- **docs**: Documentation only changes
- **style**: Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc)
- **refactor**: A code change that neither fixes a bug nor adds a feature
- **perf**: A code change that improves performance
- **test**: Adding missing tests or correcting existing tests
- **build**: Changes that affect the build system or external dependencies
- **ci**: Changes to our CI configuration files and scripts
- **chore**: Other changes that don't modify src or test files
- **revert**: Reverts a previous commit

### Examples

```
feat: add support for multiple zones selection

fix: resolve setRawMode error in Docker environments

docs: update README with Docker quick-start guide

refactor: extract config loading into separate function
```

### Using Commitizen

This project includes Commitizen for guided commit messages:

```bash
pnpm commit
```

This will prompt you through creating a properly formatted commit message.

## Pull Request Process

1. Ensure your code follows the commit convention above
2. Update documentation (README, TUTORIAL, etc.) if needed
3. Make sure your code passes linting and builds successfully
4. Push your branch to your fork:
   ```bash
   git push origin feat/your-feature-name
   ```
5. Open a Pull Request against the `main` branch
6. Provide a clear description of:
   - What changes you made
   - Why you made them
   - Any relevant issue numbers

## Code Style

- Use TypeScript for all source code
- Follow the existing code style (enforced by ESLint and Prettier)
- Write clear, descriptive variable and function names
- Add comments for complex logic
- Keep functions small and focused

## Project Structure

```
src/
├── index.ts          # Entry point
├── setup.ts          # Interactive setup and menus
├── config.ts         # Configuration loading/saving
├── cloudflare.ts     # Cloudflare API service
├── updater.ts        # DNS/Access update logic
└── ip.ts             # Public IP detection
```

## Need Help?

If you have questions or need help with your contribution, feel free to:

- Open an issue for discussion
- Ask questions in your Pull Request

Thank you for contributing! 🎉
