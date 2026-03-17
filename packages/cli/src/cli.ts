#!/usr/bin/env node

import { resolve, basename, join } from "node:path";
import { Command } from "commander";
import { parseWsdl } from "./parser/wsdl-parser.js";
import { generateTypeScript } from "./generator/codegen.js";
import { writeGeneratedFile } from "./generator/writer.js";

const program = new Command();

program
  .name("tsoap")
  .description("Generate type-safe TypeScript clients from WSDL files")
  .version("0.0.1");

program
  .command("generate")
  .description("Parse a WSDL and generate a typed TypeScript client")
  .requiredOption("-i, --input <path>", "Path or URL to the WSDL file")
  .requiredOption("-o, --output <dir>", "Output directory for generated files")
  .action(async (opts: { input: string; output: string }) => {
    const inputPath = opts.input;
    const outputDir = resolve(opts.output);

    const isUrl = inputPath.startsWith("http://") || inputPath.startsWith("https://");
    const resolvedInput = isUrl ? inputPath : resolve(inputPath);
    const outputFileName = basename(inputPath, ".wsdl") + ".ts";
    const outputPath = join(outputDir, outputFileName);

    console.log(`Parsing WSDL: ${resolvedInput}`);
    const parsed = await parseWsdl(resolvedInput);

    console.log(
      `Found ${parsed.services.length} service(s), ` +
        `${parsed.types.length} type(s), ` +
        `${parsed.enums.length} enum(s)`,
    );

    const source = generateTypeScript(parsed, basename(inputPath));
    await writeGeneratedFile(outputPath, source);

    console.log(`Generated: ${outputPath}`);
  });

program.parse();
