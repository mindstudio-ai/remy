/**
 * Parse a partial/incomplete JSON string, returning as much structured
 * data as possible. Unterminated strings are closed, incomplete objects
 * and arrays are returned with whatever keys/elements were parsed.
 *
 * Adapted from https://github.com/promplate/partial-json-parser-js
 */

class PartialJSON extends Error {}
class MalformedJSON extends Error {}

export function parsePartialJson(jsonString: string): any {
  const length = jsonString.length;
  let index = 0;

  const markPartial = (msg: string): never => {
    throw new PartialJSON(`${msg} at position ${index}`);
  };

  const throwMalformed = (msg: string): never => {
    throw new MalformedJSON(`${msg} at position ${index}`);
  };

  const skipBlank = () => {
    while (index < length && ' \n\r\t'.includes(jsonString[index])) {
      index++;
    }
  };

  const parseAny: () => any = () => {
    skipBlank();
    if (index >= length) {
      markPartial('Unexpected end of input');
    }

    const ch = jsonString[index];
    if (ch === '"') {
      return parseStr();
    }
    if (ch === '{') {
      return parseObj();
    }
    if (ch === '[') {
      return parseArr();
    }

    if (
      jsonString.substring(index, index + 4) === 'null' ||
      (length - index < 4 && 'null'.startsWith(jsonString.substring(index)))
    ) {
      index += 4;
      return null;
    }
    if (
      jsonString.substring(index, index + 4) === 'true' ||
      (length - index < 4 && 'true'.startsWith(jsonString.substring(index)))
    ) {
      index += 4;
      return true;
    }
    if (
      jsonString.substring(index, index + 5) === 'false' ||
      (length - index < 5 && 'false'.startsWith(jsonString.substring(index)))
    ) {
      index += 5;
      return false;
    }

    return parseNum();
  };

  const parseStr = (): string => {
    const start = index;
    let escape = false;
    index++; // skip opening quote
    while (
      index < length &&
      (jsonString[index] !== '"' || (escape && jsonString[index - 1] === '\\'))
    ) {
      escape = jsonString[index] === '\\' ? !escape : false;
      index++;
    }
    if (jsonString.charAt(index) === '"') {
      try {
        return JSON.parse(
          jsonString.substring(start, ++index - Number(escape)),
        );
      } catch (e) {
        return throwMalformed(String(e));
      }
    }
    // Unterminated string — close it and parse what we have
    try {
      return JSON.parse(
        jsonString.substring(start, index - Number(escape)) + '"',
      );
    } catch {
      return JSON.parse(
        jsonString.substring(start, jsonString.lastIndexOf('\\')) + '"',
      );
    }
  };

  const parseObj = () => {
    index++; // skip {
    skipBlank();
    const obj: Record<string, any> = {};
    try {
      while (jsonString[index] !== '}') {
        skipBlank();
        if (index >= length) {
          return obj;
        }
        const key = parseStr();
        skipBlank();
        index++; // skip colon
        try {
          obj[key] = parseAny();
        } catch {
          return obj;
        }
        skipBlank();
        if (jsonString[index] === ',') {
          index++;
        }
      }
    } catch {
      return obj;
    }
    index++; // skip }
    return obj;
  };

  const parseArr = () => {
    index++; // skip [
    const arr: any[] = [];
    try {
      while (jsonString[index] !== ']') {
        arr.push(parseAny());
        skipBlank();
        if (jsonString[index] === ',') {
          index++;
        }
      }
    } catch {
      return arr;
    }
    index++; // skip ]
    return arr;
  };

  const parseNum = () => {
    if (index === 0) {
      if (jsonString === '-') {
        throwMalformed("Not sure what '-' is");
      }
      try {
        return JSON.parse(jsonString);
      } catch (e) {
        try {
          return JSON.parse(
            jsonString.substring(0, jsonString.lastIndexOf('e')),
          );
        } catch {}
        throwMalformed(String(e));
      }
    }

    const start = index;
    if (jsonString[index] === '-') {
      index++;
    }
    while (jsonString[index] && ',]}'.indexOf(jsonString[index]) === -1) {
      index++;
    }

    try {
      return JSON.parse(jsonString.substring(start, index));
    } catch (e) {
      if (jsonString.substring(start, index) === '-') {
        markPartial("Not sure what '-' is");
      }
      try {
        return JSON.parse(
          jsonString.substring(start, jsonString.lastIndexOf('e')),
        );
      } catch {
        throwMalformed(String(e));
      }
    }
  };

  return parseAny();
}
