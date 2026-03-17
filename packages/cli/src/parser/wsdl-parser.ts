import * as soap from "soap";
import { stripNamespace, resolveXsdPrimitive } from "../generator/xsd-types.js";

export interface ParsedField {
  name: string;
  /** TypeScript type as a source string (e.g. "string", "number", "MyInterface") */
  tsType: string;
  isArray: boolean;
  isOptional: boolean;
  /** If true, the generated type should include a JSDoc precision warning */
  precisionRisk: boolean;
}

export interface ParsedType {
  name: string;
  fields: ParsedField[];
}

export interface ParsedEnum {
  name: string;
  values: string[];
}

export interface ParsedOperation {
  name: string;
  input: ParsedType;
  output: ParsedType;
}

export interface ParsedPort {
  name: string;
  operations: ParsedOperation[];
}

export interface ParsedService {
  name: string;
  ports: ParsedPort[];
}

export interface ParsedWsdl {
  services: ParsedService[];
  enums: ParsedEnum[];
  types: ParsedType[];
}

type DescribeResult = Record<
  string,
  Record<string, Record<string, Record<string, unknown>>>
>;

interface SchemaFieldInfo {
  name: string;
  type: string;
  minOccurs: string | undefined;
  maxOccurs: string | undefined;
}

interface SchemaElementInfo {
  fields: SchemaFieldInfo[];
}

type SchemaMap = Map<string, SchemaElementInfo>;

/**
 * Walks `client.wsdl.definitions.schemas` to build a lookup map
 * of element/complexType names to their field metadata (type ref,
 * minOccurs, maxOccurs). This gives us data that `describe()` loses.
 */
function buildSchemaMap(client: soap.Client): SchemaMap {
  const map: SchemaMap = new Map();
  const wsdl = client.wsdl as unknown as Record<string, unknown>;
  const definitions = wsdl.definitions as Record<string, unknown> | undefined;
  const schemas = definitions?.schemas as
    | Record<string, Record<string, unknown>>
    | undefined;

  if (!schemas) return map;

  for (const schema of Object.values(schemas)) {
    extractFromSchemaSection(schema.complexTypes, map);
    extractFromSchemaSection(schema.elements, map);
  }

  return map;
}

/**
 * Resolves the actual WSDL element names for an operation's input/output
 * by reading from the port's resolved binding. This avoids guessing
 * based on naming conventions (e.g. `${opName}Request`).
 *
 * The soap library attaches the full binding object (with resolved
 * portType methods) directly to each port at
 * `definitions.services[svc].ports[port].binding.methods[op]`.
 */
function resolveElementNames(
  client: soap.Client,
  serviceName: string,
  portName: string,
  opName: string,
): { input: string; output: string } | null {
  try {
    const wsdl = client.wsdl as unknown as Record<string, unknown>;
    const definitions = wsdl.definitions as Record<string, unknown>;
    const services = definitions.services as Record<string, Record<string, unknown>>;
    const svc = services[serviceName];
    const ports = svc?.ports as Record<string, Record<string, unknown>> | undefined;
    const port = ports?.[portName];
    const binding = port?.binding as Record<string, unknown> | undefined;
    const methods = binding?.methods as
      | Record<string, Record<string, unknown>>
      | undefined;
    const method = methods?.[opName];
    const inputEl = method?.input as Record<string, unknown> | undefined;
    const outputEl = method?.output as Record<string, unknown> | undefined;
    const inputName = inputEl?.$name as string | undefined;
    const outputName = outputEl?.$name as string | undefined;

    if (inputName && outputName) {
      return { input: inputName, output: outputName };
    }
  } catch {
    // fall through
  }
  return null;
}

function extractFromSchemaSection(
  section: unknown,
  map: SchemaMap,
): void {
  if (!section || typeof section !== "object") return;

  for (const [name, def] of Object.entries(
    section as Record<string, unknown>,
  )) {
    const fields = extractFields(def);
    if (fields.length > 0) {
      map.set(name, { fields });
    }
  }
}

function extractFields(node: unknown): SchemaFieldInfo[] {
  if (!node || typeof node !== "object") return [];
  const obj = node as Record<string, unknown>;
  const children = obj.children as unknown[] | undefined;
  if (!children) return [];

  const fields: SchemaFieldInfo[] = [];
  for (const child of children) {
    const childObj = child as Record<string, unknown>;
    if (childObj.$name && childObj.$type) {
      fields.push({
        name: childObj.$name as string,
        type: childObj.$type as string,
        minOccurs: childObj.$minOccurs as string | undefined,
        maxOccurs: childObj.$maxOccurs as string | undefined,
      });
    }
    const nested = extractFields(child);
    fields.push(...nested);
  }
  return fields;
}

function pascalCase(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Parses an element descriptor from `client.describe()`,
 * cross-referencing with the schema map for type names and optionality.
 */
function parseFieldDescriptor(
  fieldName: string,
  descriptor: unknown,
  collectedTypes: Map<string, ParsedType>,
  collectedEnums: Map<string, ParsedEnum>,
  schemaMap: SchemaMap,
  parentSchemaInfo: SchemaElementInfo | undefined,
): ParsedField {
  const isArray = fieldName.endsWith("[]");
  const cleanName = isArray ? fieldName.slice(0, -2) : fieldName;

  const schemaField = parentSchemaInfo?.fields.find(
    (f) => f.name === cleanName,
  );
  const isOptional = schemaField?.minOccurs === "0";

  if (typeof descriptor === "string") {
    const enumMatch = descriptor.match(/^(\w+)\|[^|]+\|(.+)$/);
    if (enumMatch) {
      const enumName = enumMatch[1];
      const values = enumMatch[2].split(",");
      if (!collectedEnums.has(enumName)) {
        collectedEnums.set(enumName, { name: enumName, values });
      }
      return {
        name: cleanName,
        tsType: enumName,
        isArray,
        isOptional,
        precisionRisk: false,
      };
    }

    const localName = stripNamespace(descriptor);
    const primitive = resolveXsdPrimitive(localName);
    if (primitive) {
      return {
        name: cleanName,
        tsType: primitive.tsType,
        isArray,
        isOptional,
        precisionRisk: primitive.precisionRisk,
      };
    }

    return {
      name: cleanName,
      tsType: localName,
      isArray,
      isOptional,
      precisionRisk: false,
    };
  }

  if (typeof descriptor === "object" && descriptor !== null) {
    let typeName: string;

    if (schemaField?.type) {
      const localTypeName = stripNamespace(schemaField.type);
      typeName = pascalCase(localTypeName);
    } else {
      typeName = pascalCase(cleanName);
    }

    if (!collectedTypes.has(typeName)) {
      // BUG 1 FIX: insert placeholder BEFORE recursing to prevent
      // infinite recursion on self-referencing types (e.g. TreeNode)
      const placeholder: ParsedType = { name: typeName, fields: [] };
      collectedTypes.set(typeName, placeholder);

      const nestedSchemaInfo = schemaMap.get(typeName) ?? schemaMap.get(cleanName);
      const fields = parseObjectDescriptor(
        descriptor as Record<string, unknown>,
        collectedTypes,
        collectedEnums,
        schemaMap,
        nestedSchemaInfo,
      );
      placeholder.fields = fields;
    }
    return {
      name: cleanName,
      tsType: typeName,
      isArray,
      isOptional,
      precisionRisk: false,
    };
  }

  return {
    name: cleanName,
    tsType: "unknown",
    isArray,
    isOptional,
    precisionRisk: false,
  };
}

function parseObjectDescriptor(
  obj: Record<string, unknown>,
  collectedTypes: Map<string, ParsedType>,
  collectedEnums: Map<string, ParsedEnum>,
  schemaMap: SchemaMap,
  parentSchemaInfo: SchemaElementInfo | undefined,
): ParsedField[] {
  const fields: ParsedField[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith("$") || key === "targetNSAlias" || key === "targetNamespace") {
      continue;
    }
    fields.push(
      parseFieldDescriptor(
        key,
        value,
        collectedTypes,
        collectedEnums,
        schemaMap,
        parentSchemaInfo,
      ),
    );
  }
  return fields;
}

/**
 * Picks a unique type name for an operation's input/output.
 * If the base name already exists in collectedTypes, prefixes
 * with the port name to disambiguate (BUG 2 FIX).
 */
function uniqueTypeName(
  baseName: string,
  portName: string,
  collectedTypes: Map<string, ParsedType>,
): string {
  if (!collectedTypes.has(baseName)) {
    return baseName;
  }
  return `${portName}${baseName}`;
}

/**
 * Loads a WSDL file (local path or URL) and returns a normalized IR
 * representing all services, ports, operations, and types.
 */
export async function parseWsdl(wsdlPath: string): Promise<ParsedWsdl> {
  const client = await soap.createClientAsync(wsdlPath);
  const description = client.describe() as DescribeResult;
  const schemaMap = buildSchemaMap(client);
  const collectedTypes = new Map<string, ParsedType>();
  const collectedEnums = new Map<string, ParsedEnum>();
  const services: ParsedService[] = [];

  for (const [serviceName, serviceDesc] of Object.entries(description)) {
    const ports: ParsedPort[] = [];

    for (const [portName, portDesc] of Object.entries(serviceDesc)) {
      const operations: ParsedOperation[] = [];

      for (const [opName, opDesc] of Object.entries(portDesc)) {
        const opObj = opDesc as Record<string, Record<string, unknown>>;
        const inputDesc = opObj.input ?? {};
        const outputDesc = opObj.output ?? {};

        // BUG 3 FIX: resolve actual element names from the port's binding
        // instead of guessing based on naming conventions.
        const elementNames = resolveElementNames(client, serviceName, portName, opName);
        const inputElementName = elementNames?.input ?? `${opName}Request`;
        const outputElementName = elementNames?.output ?? `${opName}Response`;

        // BUG 2 FIX: if the type name already exists (e.g. same op name
        // in a different port), prefix with the port name.
        const inputTypeName = uniqueTypeName(
          pascalCase(inputElementName),
          portName,
          collectedTypes,
        );
        const outputTypeName = uniqueTypeName(
          pascalCase(outputElementName),
          portName,
          collectedTypes,
        );

        // BUG 3 FIX: look up schema info by the actual element name
        const inputSchemaInfo =
          schemaMap.get(inputElementName) ?? schemaMap.get(inputTypeName);
        const outputSchemaInfo =
          schemaMap.get(outputElementName) ?? schemaMap.get(outputTypeName);

        const inputFields = parseObjectDescriptor(
          inputDesc,
          collectedTypes,
          collectedEnums,
          schemaMap,
          inputSchemaInfo,
        );
        const outputFields = parseObjectDescriptor(
          outputDesc,
          collectedTypes,
          collectedEnums,
          schemaMap,
          outputSchemaInfo,
        );

        const inputType: ParsedType = { name: inputTypeName, fields: inputFields };
        const outputType: ParsedType = { name: outputTypeName, fields: outputFields };

        collectedTypes.set(inputTypeName, inputType);
        collectedTypes.set(outputTypeName, outputType);

        operations.push({
          name: opName,
          input: inputType,
          output: outputType,
        });
      }

      ports.push({ name: portName, operations });
    }

    services.push({ name: serviceName, ports });
  }

  return {
    services,
    enums: Array.from(collectedEnums.values()),
    types: Array.from(collectedTypes.values()),
  };
}
