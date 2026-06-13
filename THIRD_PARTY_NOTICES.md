# Third Party Notices

Last reviewed: 2026-06-13

This project is a private boxing class booking mini program. The table below records the direct third-party software dependencies declared by the workspace package manifests. It is not a substitute for legal review before commercial launch, but it gives release reviewers a stable place to check dependency names, versions, and license identifiers.

## Scope

- Sources checked: `package.json`, `apps/api/package.json`, `apps/admin/package.json`, `apps/miniapp/package.json`.
- License source: installed package `package.json` metadata under the current `pnpm` workspace.
- Coverage: direct runtime dependencies and direct development/build tooling.
- Exclusions: transitive dependency notices, merchant-owned brand assets, merchant photos, WeChat platform terms, and deployment-provider terms.

## Asset and Brand Material Policy

No third-party photos, posters, QR codes, logos, venue images, or coach images are included as project source assets for commercial use. Production brand assets, gym photos, coach photos, course images, posters, and QR codes must be supplied by the merchant or another rights holder with commercial-use permission before launch.

Do not copy code, images, icons, posters, screenshots, course copy, coach bios, or QR codes from third-party GitHub projects, templates, marketplaces, or venue websites unless the license and commercial rights are explicitly confirmed and recorded here.

## Direct Runtime Dependencies

| Package | Version Checked | License | Used By |
| --- | ---: | --- | --- |
| `@babel/runtime` | 7.29.7 | MIT | Miniapp runtime helpers |
| `@nestjs/common` | 11.1.26 | MIT | API |
| `@nestjs/config` | 4.0.4 | MIT | API |
| `@nestjs/core` | 11.1.26 | MIT | API |
| `@nestjs/jwt` | 11.0.2 | MIT | API authentication |
| `@nestjs/passport` | 11.0.5 | MIT | API authentication |
| `@nestjs/platform-express` | 11.1.26 | MIT | API HTTP server |
| `@nestjs/schedule` | 6.1.3 | MIT | API notification worker scheduling |
| `@prisma/client` | 6.19.3 | Apache-2.0 | API database client |
| `@tarojs/components` | 3.6.36 | MIT | Miniapp UI components |
| `@tarojs/react` | 3.6.36 | MIT | Miniapp React integration |
| `@tarojs/runtime` | 3.6.36 | MIT | Miniapp runtime |
| `@tarojs/shared` | 3.6.36 | MIT | Miniapp shared utilities |
| `@tarojs/taro` | 3.6.36 | MIT | Miniapp platform API |
| `antd` | 5.29.3 | MIT | Admin UI |
| `bcryptjs` | 2.4.3 | MIT | API password hashing |
| `class-transformer` | 0.5.1 | MIT | API DTO transformation |
| `class-validator` | 0.14.4 | MIT | API DTO validation |
| `dayjs` | 1.11.21 | MIT | Admin date formatting |
| `lucide-react` | 0.468.0 | ISC | Admin icons |
| `passport` | 0.7.0 | MIT | API authentication |
| `passport-jwt` | 4.0.1 | MIT | API JWT authentication |
| `react` | 18.3.1 | MIT | Admin and miniapp UI |
| `react-dom` | 18.3.1 | MIT | Admin and miniapp UI |
| `reflect-metadata` | 0.2.2 | Apache-2.0 | NestJS metadata support |
| `rxjs` | 7.8.2 | Apache-2.0 | NestJS reactive primitives |

## Development and Build Tooling

| Package | Version Checked | License | Used By |
| --- | ---: | --- | --- |
| `@babel/core` | 7.29.7 | MIT | Miniapp build |
| `@nestjs/cli` | 11.0.22 | MIT | API build/dev tooling |
| `@nestjs/schematics` | 11.1.0 | MIT | API scaffolding tooling |
| `@nestjs/testing` | 11.1.26 | MIT | API tests |
| `@tarojs/cli` | 3.6.36 | MIT | Miniapp build/dev tooling |
| `@tarojs/helper` | 3.6.36 | MIT | Miniapp build/dev tooling |
| `@tarojs/plugin-framework-react` | 3.6.36 | MIT | Miniapp build |
| `@tarojs/plugin-platform-weapp` | 3.6.36 | MIT | WeChat miniapp build |
| `@tarojs/taro-loader` | 3.6.36 | MIT | Miniapp webpack loader |
| `@tarojs/webpack5-runner` | 3.6.36 | MIT | Miniapp build |
| `@types/bcryptjs` | 2.4.6 | MIT | API types |
| `@types/express` | 5.0.6 | MIT | API types |
| `@types/jest` | 29.5.14 | MIT | API tests |
| `@types/node` | 24.13.1 | MIT | Tooling types |
| `@types/passport-jwt` | 4.0.1 | MIT | API types |
| `@types/react` | 18.3.31 | MIT | Admin and miniapp types |
| `@types/react-dom` | 18.3.7 | MIT | Admin types |
| `@types/supertest` | 6.0.3 | MIT | API tests |
| `@vitejs/plugin-react` | 4.7.0 | MIT | Admin build |
| `babel-preset-taro` | 3.6.36 | MIT | Miniapp build |
| `eslint` | 9.39.4 | MIT | Static analysis |
| `jest` | 29.7.0 | MIT | API tests |
| `miniprogram-automator` | 0.12.1 | MIT | Optional miniapp visual QA capture |
| `prisma` | 6.19.3 | Apache-2.0 | Database migrations and client generation |
| `sass` | 1.100.0 | MIT | Miniapp styles |
| `source-map-support` | 0.5.21 | MIT | API test/build support |
| `supertest` | 7.2.2 | MIT | API HTTP tests |
| `ts-jest` | 29.4.11 | MIT | API TypeScript tests |
| `ts-loader` | 9.6.0 | MIT | API build support |
| `ts-node` | 10.9.2 | MIT | API tooling |
| `tsx` | 4.22.4 | MIT | API scripts |
| `typescript` | 5.9.3 | Apache-2.0 | TypeScript compiler |
| `vite` | 4.5.14 | MIT | Admin build |
| `webpack` | 5.91.0 | MIT | Miniapp build |

## Release Review Notes

- Re-run `node --test scripts/third-party-notices.test.mjs` after adding, removing, or upgrading direct dependencies.
- Re-read upstream package licenses before commercial launch if a dependency changes from MIT, Apache-2.0, or ISC.
- Add transitive dependency notices if the distribution model changes to require bundled third-party notices beyond direct dependencies.
