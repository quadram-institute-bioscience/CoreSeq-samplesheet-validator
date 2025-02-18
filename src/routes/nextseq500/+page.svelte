<script lang="ts">
  import { validateSampleSheet, reverseComplement } from '$lib/utils';
  import { reverseComplement500 } from '$lib/stores';
  import type { ValidationResult } from '$lib/types';
  import DragAndDrop from '$lib/components/DragAndDrop.svelte';
  import Table from '$lib/components/Table.svelte';
  import Nav from '$lib/components/Nav.svelte';

  let file: File | null = null;
  let fileContent: string = '';
  let result: ValidationResult | null = null;
  let error: string | null = null;
  let headers: string[] = [];
  let rows: string[][] = [];
  let originalRows: string[][] = [];

  function findColumnIndex(headers: string[], columnName: string): number {
    const index = headers.findIndex(header => 
      header.toLowerCase().replace(/[_\s]/g, '') === columnName.toLowerCase().replace(/[_\s]/g, '')
    );
    return index;
  }

  function parseIlluminaSampleSheet(content: string) {
    // Replace all possible line endings with \n
    const normalizedContent = content.replace(/\r\n|\r|\n/g, '\n');
    const lines = normalizedContent.split('\n');
    let dataSection = false;
    let headerLines: string[] = [];
    let dataLines: string[] = [];

    // Process each line
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Remove empty trailing commas
      const cleanLine = line.replace(/,+$/, '');
      
      // Check for [Data] section
      if (cleanLine === '[Data]') {
        dataSection = true;
        // Reset data lines when new [Data] section is found
        dataLines = [];
        continue;
      }

      if (!dataSection) {
        // Collect header lines (including empty lines)
        headerLines.push(lines[i]);
      } else if (cleanLine.length > 0) {
        // Collect non-empty data lines
        dataLines.push(cleanLine);
      }
    }

    if (!dataSection) {
      throw new Error('Invalid sample sheet format: [Data] section not found');
    }

    if (dataLines.length < 2) {
      throw new Error('Invalid sample sheet format: No data found after [Data] section');
    }

    return {
      headerSection: headerLines,
      dataLines: dataLines
    };
  }

  function handleDuplicateSampleIds(rows: string[][], headers: string[]): string[][] {
    const sampleIdCol = findColumnIndex(headers, 'Sample_ID');
    if (sampleIdCol === -1) return rows;

    // Track seen sample IDs and their count
    const sampleIdCounts: { [key: string]: number } = {};
    
    return rows.map(row => {
      const newRow = [...row];
      const sampleId = newRow[sampleIdCol];
      
      // Count occurrences of this sample ID
      sampleIdCounts[sampleId] = (sampleIdCounts[sampleId] || 0) + 1;
      
      // If this is a duplicate (count > 1), append suffix
      if (sampleIdCounts[sampleId] > 1) {
        newRow[sampleIdCol] = `${sampleId}_${sampleIdCounts[sampleId]}`;
        
        // If Description is same as Sample_ID, update it too
        const descriptionCol = findColumnIndex(headers, 'Description');
        if (descriptionCol !== -1 && newRow[descriptionCol] === sampleId) {
          newRow[descriptionCol] = newRow[sampleIdCol];
        }
      }
      
      return newRow;
    });
  }

  async function processContent(content: string) {
    try {
      // Parse sample sheet and get both sections
      const { headerSection, dataLines } = parseIlluminaSampleSheet(content);
      
      // First line of dataLines contains headers
      headers = dataLines[0].split(',').map(header => header.trim());

      // Find indexes for Sample_ID and Description columns
      const sampleIdCol = findColumnIndex(headers, 'Sample_ID');
      const descriptionCol = findColumnIndex(headers, 'Description');

      // Store original rows if not already stored
      if (originalRows.length === 0) {
        // First process the rows to fill empty descriptions
        const processedRows = dataLines.slice(1).map(line => {
          const cells = line.split(',').map(cell => cell.trim());
          // Fill empty Description with Sample_ID value
          if (descriptionCol !== -1 && sampleIdCol !== -1 && !cells[descriptionCol]) {
            cells[descriptionCol] = cells[sampleIdCol];
          }
          return cells;
        });

        // Then handle any duplicate Sample_IDs
        originalRows = handleDuplicateSampleIds(processedRows, headers);
      }

      // Find index2 column position
      const index2Col = findColumnIndex(headers, 'index2');
      
      // Create new rows based on original data
      rows = originalRows.map(row => {
        const newRow = [...row];
        if ($reverseComplement500 && index2Col !== -1 && newRow[index2Col]) {
          const original = newRow[index2Col];
          const reversed = reverseComplement(original);
          newRow[index2Col] = reversed;
        }
        return newRow;
      });

      // Validate after parsing
      result = validateSampleSheet(dataLines.join('\n'));
      error = null;

    } catch (e) {
      error = e instanceof Error ? e.message : 'An error occurred';
      result = null;
    }
  }

  async function handleFile(uploadedFile: File) {
    file = uploadedFile;
    // Reset all state variables
    reverseComplement500.set(false);
    fileContent = '';
    result = null;
    error = null;
    headers = [];
    rows = [];
    originalRows = []; // Important to reset this so new file processing works correctly
    
    try {
      fileContent = await file.text();
      await processContent(fileContent);
    } catch (e) {
      error = e instanceof Error ? e.message : 'An error occurred';
    }
  }

  // Watch for changes in reverseComplementEnabled
  $: {
    if (fileContent) {
      processContent(fileContent);
    }
  }

  // Function to get summary statistics
  function getSummaryStats() {
    if (!rows.length || !headers.length) return null;

    // Find Project column index
    const projectColIndex = headers.findIndex(header => 
      header.toLowerCase().includes('project')
    );

    if (projectColIndex === -1) return null;

    // Count samples per project
    const projectCounts = rows.reduce((acc, row) => {
      const project = row[projectColIndex];
      acc[project] = (acc[project] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalSamples: rows.length,
      projectCounts
    };
  }

  function downloadValidated(removeProject = false) {
    if (!headers.length || !rows.length || !fileContent) return;

    let downloadHeaders = [...headers];
    let downloadRows = rows.map(row => [...row]);

    if (removeProject) {
      // Find Sample_Project column index
      const projectColIndex = headers.findIndex(header => 
        header.toLowerCase().includes('project')
      );
      
      if (projectColIndex !== -1) {
        downloadHeaders = headers.filter((_, i) => i !== projectColIndex);
        downloadRows = rows.map(row => 
          row.filter((_, i) => i !== projectColIndex)
        );
      }
    }

    try {
      // Get the header section from the original file
      const { headerSection } = parseIlluminaSampleSheet(fileContent);

      // Create CSV content with original header section
      const csvContent = [
        ...headerSection,
        '[Data]',
        downloadHeaders.join(','),
        ...downloadRows.map(row => {
          // Pad shorter rows with empty cells to match header length
          const paddedRow = [...row];
          while (paddedRow.length < downloadHeaders.length) {
            paddedRow.push('');
          }
          return paddedRow.join(',');
        })
      ].join('\n');

      // Create and trigger download
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file ? 
        `${file.name.split('.')[0]}_validated${removeProject ? '_no_project' : ''}.csv` : 
        `validated${removeProject ? '_no_project' : ''}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      error = e instanceof Error ? e.message : 'An error occurred';
    }
  }

  function handleReverseComplementToggle(event: Event) {
    if (!rows.length) return;

    const index2ColIndex = headers.findIndex(h => 
      h.toLowerCase() === 'index2'
    );

    if (index2ColIndex === -1) return;

    // Don't toggle the store here, as bind:checked will handle that
    rows = rows.map((row, i) => {
      const newRow = [...row];
      if (index2ColIndex !== -1) {
        newRow[index2ColIndex] = $reverseComplement500 
          ? reverseComplement(originalRows[i][index2ColIndex])
          : originalRows[i][index2ColIndex];
      }
      return newRow;
    });
  }
</script>

<div class="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
    <Nav />
    <div class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div class="text-center mb-4">
            <h1 class="text-2xl font-bold tracking-tight text-gray-900">
                Sample Sheet Validator NextSeq 500
            </h1>
        </div>
        
        <div class="space-y-4">
            <!-- Upload Section -->
            <div class="bg-white rounded-lg shadow p-4">
                <div class="grid grid-cols-3 gap-4 items-center">
                    <div class="col-span-2">
                        <DragAndDrop on:fileDropped={e => {
                            file = e.detail;
                            handleFile(e.detail);
                        }} />
                    </div>
                    <div class="col-span-1">
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                bind:checked={$reverseComplement500}
                                on:change={handleReverseComplementToggle}
                                class="sr-only peer"
                            >
                            <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            <span class="ms-3 text-sm font-medium text-gray-900">Reverse Complement Index2</span>
                        </label>
                    </div>
                </div>
            </div>

            <!-- Summary Stats and Download Section -->
            {#if headers.length && rows.length}
                {@const stats = getSummaryStats()}
                {#if stats}
                    <div class="bg-white rounded-lg shadow p-4">
                        <div class="grid grid-cols-3 gap-4">
                            <!-- Stats (2 columns) -->
                            <div class="col-span-2 grid grid-cols-2 gap-4">
                                <div>
                                    <h3 class="text-sm font-medium text-gray-500">Total Samples</h3>
                                    <p class="mt-1 text-2xl font-semibold text-gray-900">{stats.totalSamples}</p>
                                </div>
                                <div>
                                    <h3 class="text-sm font-medium text-gray-500">Samples per Project</h3>
                                    <div class="mt-1 space-y-1">
                                        {#each Object.entries(stats.projectCounts) as [project, count]}
                                            <div class="flex items-center justify-between">
                                                <span class="text-sm text-gray-600">{project}</span>
                                                <span class="text-sm font-medium text-gray-900">{count}</span>
                                            </div>
                                        {/each}
                                    </div>
                                </div>
                            </div>

                            <!-- Download Buttons (1 column) -->
                            <div class="flex flex-col justify-center space-y-2">
                                <button
                                    on:click={() => downloadValidated(false)}
                                    class="inline-flex items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                                >
                                    <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                                    </svg>
                                    Download Full Sheet
                                </button>
                                <button
                                    on:click={() => downloadValidated(true)}
                                    class="inline-flex items-center justify-center rounded-md bg-gray-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-600"
                                >
                                    <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                                    </svg>
                                    Download Without Project
                                </button>
                            </div>
                        </div>
                    </div>
                {/if}
            {/if}

            <!-- Error Message -->
            {#if error}
                <div class="rounded-lg bg-red-50 p-4 shadow ring-1 ring-red-900/5">
                    <p class="text-red-600">{error}</p>
                </div>
            {/if}

            <!-- Table Section -->
            {#if headers.length && rows.length}
                <div class="rounded-lg bg-white shadow ring-1 ring-gray-900/5">
                    <div class="px-4 py-2 border-b border-gray-200">
                        <h2 class="text-sm font-semibold text-gray-900">Sample Sheet Content</h2>
                    </div>
                    <Table {headers} {rows} />
                </div>
            {/if}

            <!-- Duplicate Indexes Warning -->
            {#if result?.duplicatedIndexes && Object.keys(result.duplicatedIndexes).length > 0}
                <div class="rounded-lg bg-yellow-50 p-4 shadow ring-1 ring-yellow-900/5">
                    <h2 class="text-sm font-semibold text-yellow-900 mb-2">Duplicate Indexes Found</h2>
                    <ul class="list-disc list-inside text-sm">
                        {#each Object.entries(result.duplicatedIndexes) as [index, samples]}
                            <li class="text-yellow-800">
                                Index combination {index} is used in samples: {samples}
                            </li>
                        {/each}
                    </ul>
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
  :global(body) {
    background-color: #f3f4f6;
  }
</style> 