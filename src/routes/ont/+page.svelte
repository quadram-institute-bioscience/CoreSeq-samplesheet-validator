<script lang="ts">
    import { replaceSpecialCharacters } from '$lib/utils';
    import { configurationOpen } from '$lib/stores';
    import DragAndDrop from '$lib/components/DragAndDrop.svelte';
    import Table from '$lib/components/Table.svelte';
    import Nav from '$lib/components/Nav.svelte';
    import * as XLSX from 'xlsx';

    let file: File | null = null;
    let fileContent: string = '';
    let error: string | null = null;
    let headers: string[] = [];
    let rows: string[][] = [];
    let originalRows: string[][] = [];

    // Configuration options
    let flowcell_id = '';
    let kit = 'SQK_NBD111_96';
    let experiment_id = '';
    let alias = '';
    let type = 'test_sample';

    // Predefined kit list
    const kitList = [
        'SQK_16S024',
        'SQK_MLK111_96_XL',
        'SQK_NBD111_24',
        'SQK_NBD111_96',
        'SQK_PCB109',
        'SQK_PCB110',
        'SQK_PCB111_24',
        'SQK_RBK001',
        'SQK_RBK004',
        'SQK_RBK110_96',
        'SQK_RBK111_24',
        'SQK_RBK111_96',
        'SQK_RLB001',
        'SQK_LWB001',
        'SQK_PBK004',
        'SQK_RAB201',
        'SQK_RAB204',
        'SQK_RPB004',
        'VSK_PTC001',
        'VSK_VMK001',
        'VSK_VPS001',
        'VSK_VMK004'
    ];

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

    async function handleFile(uploadedFile: File) {
        file = uploadedFile;
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

    // Make processContent reactive to configuration changes
    $: if (fileContent) {
        processContent(fileContent);
    }

    async function processContent(content: string) {
        try {
            const lines = content.split(/\r?\n/).filter(line => line.trim());
            
            if (lines.length === 0) {
                throw new Error('File is empty');
            }
            
            // Output headers
            headers = ['flow_cell_id', 'kit', 'sample_id', 'experiment_id', 'barcode', 'alias', 'type'];
            
            // Parse the input headers
            const inputHeaders = lines[0].split(',').map(header => header.trim().toLowerCase());
            
            // Find the indices for sample, barcode, and project columns
            const sampleIndex = inputHeaders.indexOf('samplename');
            const barcodeIndex = inputHeaders.indexOf('barcode');
            const projectIndex = inputHeaders.indexOf('project');

            if (sampleIndex === -1 || barcodeIndex === -1) {
                throw new Error('Required columns "SampleName" and "Barcode" not found');
            }

            // Process the rows
            originalRows = lines.slice(1)
                .filter(line => line.trim())
                .map(line => {
                    const cells = line.split(',').map(cell => cell.trim());
                    if (cells.length <= Math.max(sampleIndex, barcodeIndex)) {
                        throw new Error('Row has insufficient columns');
                    }
                    
                    const sampleName = cells[sampleIndex];
                    let barcode = cells[barcodeIndex];
                    const project = projectIndex !== -1 ? cells[projectIndex] : type;
                    
                    // Replace NB_ with barcode in the barcode value
                    if (barcode.startsWith('NB_')) {
                        barcode = 'barcode' + barcode.substring(3);
                    }
                    
                    const cleanedSampleName = replaceSpecialCharacters(sampleName);

                    return [
                        flowcell_id,
                        kit,
                        cleanedSampleName,  // sample_id
                        experiment_id,
                        barcode,           // processed barcode
                        cleanedSampleName,  // alias
                        project            // use project value for type
                    ];
                });

            rows = [...originalRows];
            error = null;
            
        } catch (e) {
            error = e instanceof Error ? e.message : 'An error occurred';
            headers = [];
            rows = [];
            originalRows = [];
        }
    }

    // Make the table reactive to configuration changes
    $: if (rows.length > 0) {
        rows = originalRows.map(row => {
            const newRow = [...row];
            newRow[0] = flowcell_id;  // flow_cell_id
            newRow[1] = kit;          // kit
            newRow[3] = experiment_id; // experiment_id
            // Only update type if it's set in the configuration
            if (type !== '') {
                newRow[6] = type;     // type
            }
            return newRow;
        });
    }

    function downloadValidated() {
        if (!headers.length || !rows.length) return;

        // Check for empty required fields
        const hasEmptyFields = rows.some(row => {
            return row.some((cell, index) => {
                // Skip experiment_id (index 3)
                if (index === 3) return false;
                // Check all other fields
                return !cell || cell.trim() === '';
            });
        });

        if (hasEmptyFields) {
            error = 'All fields except Experiment ID must be filled before downloading';
            return;
        }

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const date = new Date().toISOString().split('T')[0];
        a.href = url;
        a.download = file ? 
            `${file.name.split('.')[0]}_validated.csv` : 
            `ont_samplesheet_${date}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function getSummaryStats() {
        if (!rows.length) return null;

        const barcodeIndex = headers.findIndex(h => h.toLowerCase() === 'barcode');
        const uniqueBarcodes = new Set(rows.map(row => row[barcodeIndex])).size;

        return {
            totalSamples: rows.length,
            uniqueBarcodes
        };
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
                    ONT Sample Sheet Validator
                </h1>
                <div class="mb-4 border-l-4 border-red-400 bg-red-50 p-4">
					<div class="flex">
						<div class="flex-shrink-0">
							<svg class="h-5 w-5 text-red-800" viewBox="0 0 20 20" fill="currentColor">
								<path
									fill-rule="evenodd"
									d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
									clip-rule="evenodd"
								/>
							</svg>
						</div>
						<div class="ml-3">
							<h3 class="text-large font-medium text-red-400">THIS TOOL IS DEPRECATED AND NOT TO BE USED. ONLY THE NEXTSEQ2000 TOOL IS FUNCTIONAL.</h3>
						</div>
					</div>
				</div>
            </div>

            <!-- Add this section before the Upload Section -->
            <div class="bg-blue-50 rounded-lg shadow p-4 mb-4">
                <h3 class="text-sm font-medium text-blue-800 mb-2">Input Requirements:</h3>
                <ul class="list-disc list-inside text-sm text-blue-700 space-y-1">
                    <li>File format: CSV or Excel (.xlsx, .xls)</li>
                    <li>Required columns:
                        <ul class="list-disc list-inside ml-4">
                            <li>SampleName - Sample identifier</li>
                            <li>Barcode - Sample barcode (NB_01 will be converted to barcode01)</li>
                            <li>Project - Project name (optional, will be used as type)</li>
                        </ul>
                    </li>
                    <li>Configuration: Flowcell ID and Kit must be specified before downloading</li>
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
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                    </svg>
                </button>

                {#if $configurationOpen}
                    <div class="px-6 pb-6 space-y-6">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Flowcell ID</label>
                                <input 
                                    type="text" 
                                    bind:value={flowcell_id}
                                    class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                    placeholder="e.g., PAO25751"
                                />
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Kit</label>
                                <div class="mt-1 relative">
                                    <input 
                                        type="text"
                                        list="kit-options"
                                        bind:value={kit}
                                        class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                        placeholder="Select or enter kit name"
                                    />
                                    <datalist id="kit-options">
                                        {#each kitList as kitOption}
                                            <option value={kitOption} />
                                        {/each}
                                    </datalist>
                                </div>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Experiment ID</label>
                                <input 
                                    type="text" 
                                    bind:value={experiment_id}
                                    class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                />
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Type</label>
                                <input 
                                    type="text" 
                                    bind:value={type}
                                    class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                    placeholder="e.g., test_sample"
                                />
                            </div>
                        </div>
                    </div>
                {/if}
            </div>
            
            {#if headers.length && rows.length}
                <!-- Summary Stats -->
                {@const stats = getSummaryStats()}
                {#if stats}
                    <div class="bg-white rounded-lg shadow p-4">
                        <div class="grid grid-cols-3 gap-4">
                            <div>
                                <h3 class="text-sm font-medium text-gray-500">Total Samples</h3>
                                <p class="mt-1 text-2xl font-semibold text-gray-900">{stats.totalSamples}</p>
                            </div>
                            <div>
                                <h3 class="text-sm font-medium text-gray-500">Unique Barcodes</h3>
                                <p class="mt-1 text-2xl font-semibold text-gray-900">{stats.uniqueBarcodes}</p>
                            </div>
                            <div class="flex items-center justify-end">
                                <button
                                    on:click={downloadValidated}
                                    class="inline-flex items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                                >
                                    <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                                    </svg>
                                    Download Sample Sheet
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
            {/if}
        </div>
    </div>
</div> 