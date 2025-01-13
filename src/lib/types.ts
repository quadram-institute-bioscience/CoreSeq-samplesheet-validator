export interface SampleSheet {
  Sample_ID: string;
  Description: string;
  I7_Index_ID: string;
  index: string;
  I5_Index_ID: string;
  index2: string;
  Sample_Project: string;
}

export interface ValidationResult {
  samples: string[];
  duplicatedIndexes: Record<string, string>;
} 