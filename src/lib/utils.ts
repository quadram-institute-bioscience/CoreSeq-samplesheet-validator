import type { SampleSheet, ValidationResult } from './types';

const ADAPTER_LIST = {
  nextera_xt_v2: new Map([
    ['N701', 'TAAGGCGA'],
    ['S522', 'TTATGCGA'],
    // Add more adapter sequences as needed
  ])
};

const DNA_COMPLEMENT: Record<string, string> = {
  'A': 'T',
  'T': 'A',
  'C': 'G',
  'G': 'C'
};

export function reverseComplement(sequence: string): string {
  return sequence
    .split('')
    .reverse()
    .map(base => DNA_COMPLEMENT[base] || base)
    .join('');
}

export function removeSpecialChars(
  text: string,
  replaceChar = '-',
  collapseRepeat = true
): string {
  let result = text.replace(/[^a-zA-Z0-9\-_]/g, replaceChar);
  if (collapseRepeat) {
    result = result.replace(new RegExp(`${replaceChar}+`, 'g'), replaceChar);
  }
  return result;
}

export function validateSampleSheet(
  content: string,
  adapterKit = 'nextera_xt_v2'
): ValidationResult {
  const lines = content.split('\n');
  const samples: string[] = [];
  const duplicatedIndexes: Record<string, string> = {};
  let foundHeader = false;

  const expectedHeader = [
    'Sample_ID',
    'Description',
    'I7_Index_ID',
    'index',
    'I5_Index_ID',
    'index2',
    'Sample_Project'
  ];

  for (const line of lines) {
    if (!line.trim()) continue;

    const row = line.split(',').map(cell => cell.trim());

    if (!foundHeader) {
      if (row[0].toLowerCase().includes('sample')) {
        if (!expectedHeader.every((col, i) => col === row[i])) {
          throw new Error('Invalid column headers');
        }
        foundHeader = true;
        samples.push(line);
        continue;
      }
      samples.push(line);
      continue;
    }

    const [
      sampleId,
      description,
      i7IndexId,
      index,
      i5IndexId,
      index2,
      sampleProject
    ] = row;

    const cleanSampleId = removeSpecialChars(sampleId);
    const cleanDescription = description ? removeSpecialChars(description) : cleanSampleId;
    const cleanSampleProject = removeSpecialChars(sampleProject);

    const pairIndex = `${index}+${index2}`;
    if (pairIndex in duplicatedIndexes) {
      duplicatedIndexes[pairIndex] = `${duplicatedIndexes[pairIndex]},${cleanSampleId}`;
      continue;
    }
    duplicatedIndexes[pairIndex] = cleanSampleId;

    const cleanI7IndexId = i7IndexId.replace('A-', '');
    const cleanI5IndexId = i5IndexId.replace('A-', '');

    // Validate against adapter sequences
    const adapters = ADAPTER_LIST[adapterKit as keyof typeof ADAPTER_LIST];
    if (!adapters) {
      throw new Error(`Unknown adapter kit: ${adapterKit}`);
    }

    const sample = [
      cleanSampleId,
      cleanDescription,
      cleanI7IndexId,
      adapters.get(cleanI7IndexId) || index,
      cleanI5IndexId,
      reverseComplement(adapters.get(cleanI5IndexId) || index2),
      cleanSampleProject
    ].join(',');

    samples.push(sample);
  }

  return {
    samples,
    duplicatedIndexes: Object.fromEntries(
      Object.entries(duplicatedIndexes).filter(([_, v]) => v.includes(','))
    )
  };
}

export interface ValidationResult2k {
  duplicatedIndexes: Record<string, string[]>;
  // Add any NextSeq 2000 specific validation results here
}

/**
 * Replaces multiple special characters in a string with a single hyphen.
 * @param text The input string to modify.
 * @returns The modified string with multiple special characters replaced by a single hyphen.
 */
export function replaceSpecialCharacters(text: string): string {
  if (!text) return text;

  // replace multiple special characters with a single hyphen
  let result = text.replace(/[\W_]+/g, '-');
  // replace multiple hyphens with a single hyphen
  result = result.replace(/-+/g, '-');
  // replace multiple underscores with a single underscore
  result = result.replace(/_+/g, '_');

  return result;
}

/**
 * Renames duplicate values in an array by appending a number.
 * @param values Array of values to check for duplicates
 * @returns New array with renamed duplicates
 */
export function renameDuplicates(values: string[]): string[] {
  const counts = new Map<string, number>();
  const result = values.map(value => {
    const count = counts.get(value) || 0;
    counts.set(value, count + 1);
    return count === 0 ? value : `${value}-${count}`;
  });
  return result;
}

/**
 * Converts column headers to title case.
 * @param headers Array of column headers
 * @returns New array with headers in title case
 */
export function columnsToTitleCase(headers: string[]): string[] {
  return headers.map(header =>
    header.split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('_')
  );
}

/**
 * Validates the NextSeq 2000 sample sheet format and content.
 * @param content The sample sheet content
 * @returns Validation result object
 */
export function validateSampleSheet2k(content: string): ValidationResult {
  const lines = content.split(/\r?\n/);
  let dataSection = false;
  const duplicatedIndexes: Record<string, string[]> = {};
  const indexCombinations = new Map<string, string[]>();
  let headers: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line === '[BCLConvert_Data]') {
      dataSection = true;
      continue;
    }

    if (!dataSection || !line) continue;

    // Get headers from the first data line
    if (!headers.length) {
      headers = line.split(',').map(h => h.trim());
      continue;
    }

    const cells = line.split(',').map(cell => cell.trim());

    const sampleId = cells[headers.findIndex(h => h.toLowerCase() === 'sample_id')] || '';
    const index = cells[headers.findIndex(h => h.toLowerCase() === 'index')] || '';
    const index2 = cells[headers.findIndex(h => h.toLowerCase() === 'index2')] || '';

    if (!sampleId || !index) continue;

    // Create a unique key for the index combination
    const indexKey = `${index}-${index2}`;

    // look to see if index key has already been seen (key)
    if (indexCombinations.has(indexKey)) {
      // if exists, update the list of samples (value) 
      const samples = indexCombinations.get(indexKey)!;
      samples.push(sampleId);
      indexCombinations.set(indexKey, samples);
      // add indexkey (key), and updated samples list (value) to dupindex dict
      duplicatedIndexes[indexKey] = samples;  // Mark as duplicate
    } else {
      // not previously seen, add to dict of existing index combinations
      indexCombinations.set(indexKey, [sampleId]);
    }

  }
  console.log('duplicated indexes:', duplicatedIndexes)
  console.log('index combinations:', indexCombinations)

  return {
    duplicatedIndexes,
    isValid: Object.keys(duplicatedIndexes).length === 0
  };
}

// Helper function to check if a string is a valid DNA sequence
function isDNASequence(sequence: string): boolean {
  return /^[ATCG]+$/.test(sequence);
}

// Helper function to validate NextSeq 2000 specific requirements
function validateNextSeq2kRequirements(index: string, index2: string): boolean {
  // Add NextSeq 2000 specific validation rules here
  // For example: length requirements, allowed sequences, etc.
  return true;
} 