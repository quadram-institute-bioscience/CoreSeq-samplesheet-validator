<script lang="ts">
    import { validateSampleSheet2k, reverseComplement, replaceSpecialCharacters } from '$lib/utils';
    import { reverseComplement2k, configurationOpen } from '$lib/stores';
    import type { ValidationResult } from '$lib/types';
    import DragAndDrop from '$lib/components/DragAndDrop.svelte';
    import Table from '$lib/components/Table.svelte';
    import Nav from '$lib/components/Nav.svelte';
    import * as XLSX from 'xlsx';

    let file: File | null = null;
    let fileContent: string = '';
    let result: ValidationResult | null = null;
    let error: string | null = null;
    let headers: string[] = [];
    let rows: string[][] = [];
    let originalRows: string[][] = [];
    let headerSection: string[] = [];

    // Configuration options
    let runName = 'nextseq2000';
    let adapterRead1 = 'AGATCGGAAGAGCACACGTCTGAACTCCAGTCA';
    let adapterRead2 = 'AGATCGGAAGAGCGTCGTGTAGGGAAAGAGTGT';
    let bclVersion = '4.2.7';
    let read1Cycle = 151;
    let read2Cycle = 151;
    let index1Cycle = 10;
    let index2Cycle = 10;
    let barcodeMismatchesIndex1 = 0;
    let barcodeMismatchesIndex2 = 0;
    let noLaneSplitting = true;

    function getHeaderText() {
        return `[Header],,,
FileFormatVersion,2,,
RunName,${runName},,
InstrumentPlatform,NextSeq1k2k,,
InstrumentType,NextSeq2000,,
,,,
[Reads],,,
Read1Cycles,${read1Cycle},,
Read2Cycles,${read2Cycle},,
Index1Cycles,${index1Cycle},,
Index2Cycles,${index2Cycle},,
,,,
[BCLConvert_Settings],,,
SoftwareVersion,${bclVersion},,
BarcodeMismatchesIndex1,${barcodeMismatchesIndex1},,
BarcodeMismatchesIndex2,${barcodeMismatchesIndex2},,
AdapterRead1,${adapterRead1},,
AdapterRead2,${adapterRead2},,
NoLaneSplitting,${noLaneSplitting ? 'TRUE' : 'FALSE'},,
,,,
[BCLConvert_Data],,,`.split('\n').map(line => line.trimStart()).join('\n');
    }

    async function parseExcel(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target?.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    const csvContent = XLSX.utils.sheet_to_csv(firstSheet);
                    resolve(csvContent);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = (error) => reject(error);
            reader.readAsArrayBuffer(file);
        });
    }

    function processData() {
        if (!rows.length) return;

        // Process Sample_ID column
        const sampleIdIndex = headers.findIndex(h => h.toLowerCase() === 'sample_id');
        if (sampleIdIndex !== -1) {
            rows = rows.map((row, index) => {
                const newRow = [...row];
                newRow[sampleIdIndex] = replaceSpecialCharacters(row[sampleIdIndex]);
                return newRow;
            });
        }

        // Create the final content
        const processedContent = [
            getHeaderText(),
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        // Download the file
        const blob = new Blob([processedContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const date = new Date().toISOString().split('T')[0];
        a.href = url;
        a.download = `sample_sheet_${runName}_${date}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async function handleFile(uploadedFile: File) {
        file = uploadedFile;
        // Reset the reverse complement state when loading a new file
        reverseComplement2k.set(false);
        try {
            if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
                fileContent = await parseExcel(file);
            } else {
                fileContent = await file.text();
            }
            await processContent(fileContent);
        } catch (e) {
            error = e instanceof Error ? e.message : 'An error occurred processing the file';
        }
    }

    async function processContent(content: string) {
        try {
            const lines = content.split(/\r?\n/).filter(line => line.trim());
            
            // Define the expected column order
            const expectedHeaders = ['Sample_ID', 'Index2', 'Index', 'Sample_Project'];
            
            // Check if content has full structure
            const hasFullStructure = lines.some(line => line.includes('[Header]'));
            
            if (!hasFullStructure) {
                // Parse the input headers
                const inputHeaders = lines[0].split(',').map(header => header.trim());
                
                // Create a mapping of current positions to expected positions
                const headerMap = new Map<number, number>();
                expectedHeaders.forEach((expected, expectedIndex) => {
                    const currentIndex = inputHeaders.findIndex(h => 
                        h.toLowerCase() === expected.toLowerCase()
                    );
                    if (currentIndex !== -1) {
                        headerMap.set(currentIndex, expectedIndex);
                    }
                });

                // Reorder the data according to expected format
                headers = expectedHeaders;
                originalRows = lines.slice(1)
                    .filter(line => line.trim())
                    .map(line => {
                        const cells = line.split(',').map(cell => cell.trim());
                        const reorderedCells = new Array(expectedHeaders.length).fill('');
                        
                        headerMap.forEach((newIndex, oldIndex) => {
                            reorderedCells[newIndex] = cells[oldIndex] || '';
                        });
                        
                        return reorderedCells;
                    });

                // Generate header section
                headerSection = [
                    '[Header],,,',
                    `FileFormatVersion,2,,`,
                    `RunName,${runName},,`,
                    `InstrumentPlatform,NextSeq1k2k,,`,
                    `InstrumentType,NextSeq2000,,`,
                    ',,,',
                    '[Reads],,,',
                    `Read1Cycles,${read1Cycle},,`,
                    `Read2Cycles,${read2Cycle},,`,
                    `Index1Cycles,${index1Cycle},,`,
                    `Index2Cycles,${index2Cycle},,`,
                    ',,,',
                    '[BCLConvert_Settings],,,',
                    `SoftwareVersion,${bclVersion},,`,
                    `BarcodeMismatchesIndex1,${barcodeMismatchesIndex1},,`,
                    `BarcodeMismatchesIndex2,${barcodeMismatchesIndex2},,`,
                    `AdapterRead1,${adapterRead1},,`,
                    `AdapterRead2,${adapterRead2},,`,
                    `NoLaneSplitting,${noLaneSplitting ? 'TRUE' : 'FALSE'},,`,
                    ',,,',
                    '[BCLConvert_Data],,,',
                ];
            } else {
                // Process full structure format
                let dataSection = false;
                let dataLines: string[] = [];
                headerSection = [];

                for (const line of lines) {
                    if (line.trim() === '[BCLConvert_Data]') {
                        dataSection = true;
                        headerSection.push(line);
                        continue;
                    }

                    if (!dataSection) {
                        headerSection.push(line);
                    } else if (line.trim()) {
                        dataLines.push(line);
                    }
                }

                headers = dataLines[0].split(',').map(header => header.trim());
                originalRows = dataLines.slice(1)
                    .filter(line => line.trim())
                    .map(line => line.split(',').map(cell => cell.trim()));
            }

            // Process Sample_ID column
            rows = originalRows.map(row => {
                const newRow = [...row];
                const sampleIdIndex = headers.findIndex(h => h.toLowerCase() === 'sample_id');
                if (sampleIdIndex !== -1) {
                    newRow[sampleIdIndex] = replaceSpecialCharacters(row[sampleIdIndex]);
                }
                return newRow;
            });

            // Validate the content
            result = validateSampleSheet2k(getFullContent());
            error = null;

        } catch (e) {
            error = e instanceof Error ? e.message : 'An error occurred';
            result = null;
        }
    }

    // Helper function to get full content for validation
    function getFullContent(): string {
        return [
            ...headerSection,
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');
    }

    function downloadValidated(removeProject = false) {
        if (!headers.length || !rows.length) return;

        let downloadHeaders = [...headers];
        let downloadRows = rows.map(row => [...row]);

        if (removeProject) {
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

        // Create CSV content with original header section
        const csvContent = [
            ...headerSection,
            downloadHeaders.join(','),
            ...downloadRows.map(row => {
                const paddedRow = [...row];
                while (paddedRow.length < downloadHeaders.length) {
                    paddedRow.push('');
                }
                return paddedRow.join(',');
            })
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const date = new Date().toISOString().split('T')[0];
        a.href = url;
        a.download = file ? 
            `${file.name.split('.')[0]}_validated${removeProject ? '_no_project' : ''}.csv` : 
            `validated${removeProject ? '_no_project' : ''}_${date}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

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

    function handleReverseComplementToggle(event: Event) {
        if (!rows.length) return;

        const index2ColIndex = headers.findIndex(h => 
            h.toLowerCase() === 'index2'
        );

        if (index2ColIndex === -1) return;

        rows = rows.map((row, i) => {
            const newRow = [...row];
            if (index2ColIndex !== -1) {
                newRow[index2ColIndex] = $reverseComplement2k 
                    ? reverseComplement(originalRows[i][index2ColIndex])
                    : originalRows[i][index2ColIndex];
            }
            return newRow;
        });
    }

    function toggleConfiguration() {
        $configurationOpen = !$configurationOpen;
    }
</script>

<div class="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
    <Nav />
    <div class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        
        <div class="space-y-4">
            <div class="text-center mb-4">
            <h1 class="text-2xl font-bold tracking-tight text-gray-900">
                Sample Sheet Validator NextSeq 2000
            </h1>
        </div>
            <!-- Add this section before the Upload Section -->
            <div class="bg-blue-50 rounded-lg shadow p-4 mb-4">
                <h3 class="text-sm font-medium text-blue-800 mb-2">Input Requirements:</h3>
                <ul class="list-disc list-inside text-sm text-blue-700 space-y-1">
                    <li>File format: CSV or Excel (.xlsx, .xls)</li>
                    <li>Required columns:
                        <ul class="list-disc list-inside ml-4">
                            <li>Sample_ID - Sample identifier (special characters will be removed)</li>
                            <li>Index - i7 index sequence</li>
                            <li>Index2 - i5 index sequence (can be reverse complemented)</li>
                            <li>Project - Project identifier</li>
                        </ul>
                    </li>
                    <li>Optional columns:
                        <ul class="list-disc list-inside ml-4">
                            <li>Sample_Name - Additional sample identifier</li>
                            <li>Description - Sample description</li>
                        </ul>
                    </li>
                    <li>Configuration: Run Name and Cycle settings must be specified</li>
                    <li>Note: Index2 sequences can be reverse complemented using the toggle in configuration</li>
                </ul>
            </div>

            <!-- Upload Section -->
            <div class="bg-white rounded-lg shadow p-4">
                <DragAndDrop 
                    on:fileDropped={e => handleFile(e.detail)} 
                    acceptTypes=".csv,.xlsx,.xls"
                />
            </div>

            <!-- Configuration Section -->
            <div class="bg-white rounded-lg shadow">
                <!-- Configuration Header -->
                <button
                    class="w-full px-6 py-4 flex items-center justify-between text-left"
                    on:click={toggleConfiguration}
                >
                    <h2 class="text-lg font-semibold text-gray-900">Configuration</h2>
                    <svg
                        class={`w-5 h-5 transition-transform duration-200 ${$configurationOpen ? 'transform rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M19 9l-7 7-7-7"
                        />
                    </svg>
                </button>

                <!-- Configuration Content -->
                {#if $configurationOpen}
                    <div class="px-6 pb-6 space-y-8 transition-all duration-200">
                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <!-- Left Column -->
                            <div class="space-y-6">
                                <div class="bg-gray-50 p-4 rounded-lg">
                                    <h3 class="text-sm font-medium text-gray-900 mb-4">Run Information</h3>
                                    <div class="space-y-4">
                                        <div>
                                            <label class="block text-sm font-medium text-gray-700 mb-1">Run Name</label>
                                            <input 
                                                type="text" 
                                                bind:value={runName}
                                                class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                                placeholder="Enter run name"
                                            />
                                        </div>
                                        <div>
                                            <label class="block text-sm font-medium text-gray-700 mb-1">BCL Convert Version</label>
                                            <input 
                                                type="text" 
                                                bind:value={bclVersion}
                                                class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                                placeholder="e.g., 4.2.7"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div class="bg-gray-50 p-4 rounded-lg">
                                    <h3 class="text-sm font-medium text-gray-900 mb-4">Adapter Sequences</h3>
                                    <div class="space-y-4">
                                        <div>
                                            <label class="block text-sm font-medium text-gray-700 mb-1">
                                                Adapter Read 1
                                                <span class="text-gray-500 text-xs ml-1">(Universal)</span>
                                            </label>
                                            <input 
                                                type="text" 
                                                bind:value={adapterRead1}
                                                class="font-mono block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label class="block text-sm font-medium text-gray-700 mb-1">
                                                Adapter Read 2
                                                <span class="text-gray-500 text-xs ml-1">(Universal)</span>
                                            </label>
                                            <input 
                                                type="text" 
                                                bind:value={adapterRead2}
                                                class="font-mono block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Right Column -->
                            <div class="space-y-6">
                                <div class="bg-gray-50 p-4 rounded-lg">
                                    <h3 class="text-sm font-medium text-gray-900 mb-4">Cycle Settings</h3>
                                    <div class="grid grid-cols-2 gap-4">
                                        <div>
                                            <label class="block text-sm font-medium text-gray-700 mb-1">Read 1</label>
                                            <input 
                                                type="number" 
                                                bind:value={read1Cycle}
                                                class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label class="block text-sm font-medium text-gray-700 mb-1">Read 2</label>
                                            <input 
                                                type="number" 
                                                bind:value={read2Cycle}
                                                class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label class="block text-sm font-medium text-gray-700 mb-1">Index 1</label>
                                            <input 
                                                type="number" 
                                                bind:value={index1Cycle}
                                                class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label class="block text-sm font-medium text-gray-700 mb-1">Index 2</label>
                                            <input 
                                                type="number" 
                                                bind:value={index2Cycle}
                                                class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div class="bg-gray-50 p-4 rounded-lg">
                                    <h3 class="text-sm font-medium text-gray-900 mb-4">Barcode Mismatches</h3>
                                    <div class="grid grid-cols-2 gap-4">
                                        <div>
                                            <label class="block text-sm font-medium text-gray-700 mb-1">Index 1</label>
                                            <input 
                                                type="number" 
                                                bind:value={barcodeMismatchesIndex1}
                                                class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label class="block text-sm font-medium text-gray-700 mb-1">Index 2</label>
                                            <input 
                                                type="number" 
                                                bind:value={barcodeMismatchesIndex2}
                                                class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div class="bg-gray-50 p-4 rounded-lg">
                                    <h3 class="text-sm font-medium text-gray-900 mb-4">Additional Settings</h3>
                                    <div>
                                        <label class="relative inline-flex items-center cursor-pointer">
                                            <input 
                                                type="checkbox" 
                                                bind:checked={noLaneSplitting}
                                                class="sr-only peer"
                                            >
                                            <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                            <span class="ms-3 text-sm font-medium text-gray-900">No Lane Splitting</span>
                                        </label>
                                    </div>
                                </div>

                                <div class="bg-gray-50 p-4 rounded-lg">
                                    <h3 class="text-sm font-medium text-gray-900 mb-4">Index Settings</h3>
                                    <div>
                                        <label class="relative inline-flex items-center cursor-pointer">
                                            <input 
                                                type="checkbox" 
                                                bind:checked={$reverseComplement2k}
                                                on:change={handleReverseComplementToggle}
                                                class="sr-only peer"
                                            >
                                            <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                            <span class="ms-3 text-sm font-medium text-gray-900">Reverse Complement Index2</span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                {/if}
            </div>

            <!-- Summary Stats -->
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

                            <!-- Download Buttons -->
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

                <!-- Error Message -->
                {#if error}
                    <div class="rounded-lg bg-red-50 p-4 shadow ring-1 ring-red-900/5">
                        <p class="text-red-600">{error}</p>
                    </div>
                {/if}

                <!-- Table Section -->
                <div class="rounded-lg bg-white shadow ring-1 ring-gray-900/5">
                    <div class="px-4 py-2 border-b border-gray-200">
                        <h2 class="text-sm font-semibold text-gray-900">Sample Sheet Content</h2>
                    </div>
                    <Table {headers} {rows} />
                </div>

                <!-- Duplicate Indexes Warning -->
                {#if result?.duplicatedIndexes && Object.keys(result.duplicatedIndexes).length > 0}
                    <div class="rounded-lg bg-yellow-50 p-4 shadow ring-1 ring-yellow-900/5">
                        <h3 class="text-sm font-medium text-yellow-800">Warning: Duplicate Index Combinations Found</h3>
                        <div class="mt-2 text-sm text-yellow-700">
                            <ul class="list-disc pl-5 space-y-1">
                                {#each Object.entries(result.duplicatedIndexes) as [indexCombo, samples]}
                                    <li>
                                        Index combination "{indexCombo}" is used by samples: {samples.join(', ')}
                                    </li>
                                {/each}
                            </ul>
                        </div>
                    </div>
                {/if}
            {/if}

            <!-- ... rest of the existing template ... -->
        </div>
    </div>
</div> 