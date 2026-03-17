# typed-soap

[![npm typed-soap](https://img.shields.io/npm/v/typed-soap)](https://www.npmjs.com/package/typed-soap)
[![npm tsoap-cli](https://img.shields.io/npm/v/tsoap-cli)](https://www.npmjs.com/package/tsoap-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**End-to-end type-safe SOAP client for TypeScript. Like tRPC, but for WSDL.**

---

## Overview

Legacy SOAP APIs are everywhere, but calling them from TypeScript is painful: no autocomplete, no type checking, and lots of manual XML wrangling.

**typed-soap** fixes this with a two-phase approach:

1. **Generate** (`tsoap-cli`) -- Point the CLI at a WSDL file and it generates TypeScript interfaces, a service definition type, and a typed factory function.
2. **Use** (`typed-soap`) -- Import the generated factory, get a fully typed client with autocomplete on every service, port, and operation.

```
weather.wsdl  -->  tsoap generate  -->  generated/weather.ts  -->  your app (fully typed)
```

## Quick Start

### Install

```bash
npm install typed-soap
npm install -D tsoap-cli
```

### Generate types from a WSDL

```bash
npx tsoap generate --input ./weather.wsdl --output ./generated
```

### Use the typed client

```typescript
import { createWeatherServiceClient } from './generated/weather.js';

const client = await createWeatherServiceClient('http://example.com/weather?wsdl');
const result = await client.WeatherService.WeatherPort.GetWeather({ city: 'NYC' });

console.log(result.temperature); // number
console.log(result.description); // string
```

Every property is fully typed. Typos in service names, port names, operation names, or arguments are caught at compile time.

## CLI Reference

```
tsoap generate --input <path-or-url> --output <dir>
```

| Flag | Description |
|------|-------------|
| `-i, --input <path>` | Path or URL to the WSDL file (required) |
| `-o, --output <dir>` | Output directory for generated TypeScript files (required) |

The CLI creates one `.ts` file per WSDL, named after the input file (e.g. `weather.wsdl` produces `weather.ts`).

## Runtime API

### `createSoapClient<T>(wsdlUrl, options?)`

The core function exported from `typed-soap`. The generic parameter `T` is a generated `ServiceDefinition` type.

```typescript
import { createSoapClient } from 'typed-soap';
import type { MyServiceDefinition } from './generated/my-service.js';

const client = await createSoapClient<MyServiceDefinition>(
  'http://example.com/service?wsdl',
  { endpoint: 'http://override-endpoint.com/service' }
);
```

**Options** extend the `soap` package's `IOptions` with:

| Option | Type | Description |
|--------|------|-------------|
| `endpoint` | `string` | Override the SOAP endpoint URL from the WSDL |

All standard `soap` options (like `wsdl_headers`, `wsdl_options`, etc.) are also supported.

### Generated factory functions

Each generated file exports a convenience factory so you don't need to pass the generic parameter manually:

```typescript
// Instead of:
import { createSoapClient } from 'typed-soap';
import type { WeatherServiceDefinition } from './generated/weather.js';
const client = await createSoapClient<WeatherServiceDefinition>(url);

// Just use:
import { createWeatherServiceClient } from './generated/weather.js';
const client = await createWeatherServiceClient(url);
```

## Supported XSD Types

| XSD Type | TypeScript | Notes |
|----------|-----------|-------|
| `int`, `short`, `byte`, `float`, `double` | `number` | Safe, fits within JS number |
| `unsignedInt`, `unsignedShort`, `unsignedByte` | `number` | Safe, custom deserializer applied |
| `long`, `unsignedLong`, `integer`, `decimal` | `number` | Precision risk for large values |
| `negativeInteger`, `nonNegativeInteger`, `positiveInteger`, `nonPositiveInteger` | `number` | Custom deserializer applied |
| `boolean` | `boolean` | |
| `dateTime`, `date` | `Date` | Parsed by soap via `new Date()` |
| `time`, `duration`, `gYear`, `gYearMonth`, `gMonth`, `gMonthDay`, `gDay` | `string` | No native JS equivalent |
| `string`, `normalizedString`, `token`, `language`, `Name`, `NCName`, `NMTOKEN`, `ID`, `IDREF`, `ENTITY`, `anyURI`, `QName`, `NOTATION` | `string` | |
| `base64Binary`, `hexBinary` | `string` | Encoded as text in XML |
| `anyType` | `unknown` | |
| Enumerations | Union type | e.g. `"PENDING" \| "SHIPPED"` |
| Arrays (`maxOccurs="unbounded"`) | `T[]` | |
| Optional (`minOccurs="0"`) | `T \| undefined` | Optional property |

## How It Works

### The `InferClient<T>` type

The magic is a conditional mapped type that transforms a static definition into callable methods:

```typescript
type InferClient<T extends ServiceDefinition> = {
  [S in keyof T]: {
    [P in keyof T[S]]: {
      [O in keyof T[S][P]]: T[S][P][O] extends { input: infer I; output: infer O }
        ? (input: I) => Promise<O>
        : never;
    };
  };
};
```

### The Proxy pattern

At runtime, `createSoapClient` wraps the `soap.Client` in a 3-level nested `Proxy`:

1. **Level 1** (service name) returns a proxy for ports
2. **Level 2** (port name) returns a proxy for operations
3. **Level 3** (operation name) returns an async function that calls `client[service][port][operationAsync](...)`

This means zero overhead at the type level (types are erased at compile time) and minimal overhead at runtime (just property access delegation).

## Examples

- [`examples/weather-api`](examples/weather-api) -- Simple single-operation service
- [`examples/order-api`](examples/order-api) -- Complex service with arrays, enums, optional fields, and multiple operations

## Contributing

```bash
git clone https://github.com/Deodat-Lawson/tsoap.git
cd tsoap
pnpm install
pnpm -r build

# Generate types from example WSDLs
cd examples/weather-api && pnpm generate
cd ../order-api && pnpm generate

# Type-check everything
pnpm -r typecheck
```

## License

MIT
