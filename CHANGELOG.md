# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.10] - 2026-01-29

### Fixed
- Updated credentials file to use TypeScript `import type` syntax for better compatibility with n8n verification
- Reordered exports in index.ts to export credentials before nodes (following n8n conventions)
- Improved credentials file structure alignment with official n8n standards

## [0.1.2] - 2026-01-27

### Fixed
- Updated repository URL to correct GitHub organization
- Updated homepage URL to PostProxy website

## [0.1.1] - 2026-01-27

### Changed
- Configured npm package to exclude source files from publication (only `dist/`, `README.md`, and `LICENSE` are included)
- Added versioning scripts for easier package version management

## [0.1.0] - 2026-01-27

### Added
- Initial release
- PostProxy node for n8n
- Support for profile groups and profiles management
- Post creation, update, deletion, and listing
- Scheduled publishing support
- Media attachments support
- Platform-specific parameters support

[Unreleased]: https://github.com/postproxy/n8n-nodes-postproxy/compare/v0.1.10...HEAD
[0.1.10]: https://github.com/postproxy/n8n-nodes-postproxy/compare/v0.1.2...v0.1.10
[0.1.2]: https://github.com/postproxy/n8n-nodes-postproxy/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/postproxy/n8n-nodes-postproxy/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/postproxy/n8n-nodes-postproxy/releases/tag/v0.1.0
