# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-02-06

### Added
- Proper handling of "Continue on Fail" mode - node now processes all items even if some fail
- Paired items support for proper item linking between nodes
- Error items are now returned with pairedItem information when continue on fail is enabled
- Support for processing multiple input items in a single execution

### Changed
- Node now iterates over all input items instead of processing only the first one
- Error handling improved to respect continue on fail setting
- All output items now include pairedItem metadata for proper item linking

## [0.1.13] - 2026-01-29

### Fixed
- Removed .cursor directory from repository tracking (IDE-specific configuration)

## [0.1.12] - 2026-01-29

### Fixed
- Fixed credentials file to use standard `import` instead of `import type` as required by n8n community nodes documentation
- This ensures proper TypeScript declaration file generation that matches n8n verification requirements

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

[Unreleased]: https://github.com/postproxy/n8n-nodes-postproxy/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/postproxy/n8n-nodes-postproxy/compare/v0.1.13...v0.2.0
[0.1.13]: https://github.com/postproxy/n8n-nodes-postproxy/compare/v0.1.12...v0.1.13
[0.1.12]: https://github.com/postproxy/n8n-nodes-postproxy/compare/v0.1.10...v0.1.12
[0.1.10]: https://github.com/postproxy/n8n-nodes-postproxy/compare/v0.1.2...v0.1.10
[0.1.2]: https://github.com/postproxy/n8n-nodes-postproxy/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/postproxy/n8n-nodes-postproxy/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/postproxy/n8n-nodes-postproxy/releases/tag/v0.1.0
