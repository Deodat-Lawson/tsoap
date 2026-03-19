#!/usr/bin/env node

import { resolve, basename, join } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { Command } from "commander";
import { parseWsdl } from "./parser/wsdl-parser.js";
import { generateTypeScript } from "./generator/codegen.js";
import { writeGeneratedFile } from "./generator/writer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf-8"),
) as { version: string };

const program = new Command();

program
  .name("tsoap")
  .description("Generate type-safe TypeScript clients from WSDL files")
  .version(pkg.version);

program
  .command("generate")
  .description("Parse a WSDL and generate a typed TypeScript client")
  .requiredOption("-i, --input <path>", "Path or URL to the WSDL file")
  .requiredOption("-o, --output <dir>", "Output directory for generated files")
  .action(async (opts: { input: string; output: string }) => {
    try {
      const inputPath = opts.input;
      const outputDir = resolve(opts.output);

      const isUrl =
        inputPath.startsWith("http://") || inputPath.startsWith("https://");
      const resolvedInput = isUrl ? inputPath : resolve(inputPath);
      const outputFileName = basename(inputPath, ".wsdl") + ".ts";
      const outputPath = join(outputDir, outputFileName);

      console.log(`Parsing WSDL: ${resolvedInput}`);
      const parsed = await parseWsdl(resolvedInput);

      const totalOps = parsed.services.reduce(
        (sum, svc) =>
          sum + svc.ports.reduce((s, p) => s + p.operations.length, 0),
        0,
      );

      if (parsed.services.length === 0) {
        console.warn("Warning: WSDL contains no services. Generated file will be empty.");
      } else if (totalOps === 0) {
        console.warn("Warning: WSDL services contain no operations. Generated file will have no callable methods.");
      }

      console.log(
        `Found ${parsed.services.length} service(s), ` +
          `${parsed.types.length} type(s), ` +
          `${parsed.enums.length} enum(s)`,
      );

      const source = generateTypeScript(parsed, basename(inputPath));
      await writeGeneratedFile(outputPath, source);

      console.log(`Generated: ${outputPath}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });

program.parse();
