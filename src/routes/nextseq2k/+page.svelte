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
[BCLConvert_Data],,,`
			.split('\n')
			.map((line) => line.trimStart())
			.join('\n');
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
		const sampleIdIndex = headers.findIndex((h) => h.toLowerCase() === 'sample_id');
		if (sampleIdIndex !== -1) {
			rows = rows.map((row, index) => {
				const newRow = [...row];
				newRow[sampleIdIndex] = replaceSpecialCharacters(row[sampleIdIndex]);
				return newRow;
			});
		}

		// Update headerSection with current configuration values
		headerSection = [
			'[Header],,,',
			'FileFormatVersion,2,,',
			`RunName,${runName},,`,
			'InstrumentPlatform,NextSeq1k2k,,',
			'InstrumentType,NextSeq2000,,',
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
			'[BCLConvert_Data],,,'
		];

		// Create the final content
		const processedContent = [
			...headerSection,
			headers.join(','),
			...rows.map((row) => row.join(','))
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
		// Reset states
		error = null;
		result = null;
		headers = [];
		rows = [];
		originalRows = [];
		reverseComplement2k.set(false);
		fileContent = '';

		try {
			if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
				fileContent = await parseExcel(file);
			} else {
				fileContent = await file.text();
			}

			if (!fileContent) {
				throw new Error('No file content received');
			}

			await processContent(fileContent);
		} catch (e) {
			error = e instanceof Error ? e.message : 'An error occurred processing the file';
		}
	}

	function processRows(
		originalRows: string[][],
		headers: string[]
	): {
		rows: string[][];
		changedSampleIds: string[];
		duplicatedIndexes: Record<string, string[]>;
	} {
		const changedSampleIds: string[] = [];
		const duplicatedIndexes: Record<string, string[]> = {};
		const indexCombinations = new Map<string, string[]>();

		const sampleIdIndex = headers.map((h) => h.toLowerCase()).indexOf('sample_id');
		const index1Index = headers.map((h) => h.toLowerCase()).indexOf('index');
		const index2Index = headers.map((h) => h.toLowerCase()).indexOf('index2');

		const rows = originalRows.map((row) => {
			const newRow = [...row];

			// Process Sample_ID
			if (sampleIdIndex !== -1) {
				const original = row[sampleIdIndex];
				const cleaned = replaceSpecialCharacters(original);

				if (original !== cleaned) {
					changedSampleIds.push(original);
				}

				newRow[sampleIdIndex] = cleaned;
			}

			// Check for duplicate index combinations
			if (index1Index !== -1 && index2Index !== -1) {
				const sampleId = row[sampleIdIndex] || 'Unknown';
				const index1 = row[index1Index] || '';
				const index2 = row[index2Index] || '';
				const indexKey = `${index2}-${index1}`;

				if (indexCombinations.has(indexKey)) {
					const samples = indexCombinations.get(indexKey)!;
					samples.push(sampleId);
					duplicatedIndexes[indexKey] = samples;
				} else {
					indexCombinations.set(indexKey, [sampleId]);
				}
			}

			console.log(newRow);
			return newRow;
		});

		return { rows, changedSampleIds, duplicatedIndexes };
	}

	async function processContent(content: string) {
		try {
			if (!content) {
				throw new Error('Empty content received');
			}

			const lines = content.split(/\r?\n/).filter((line) => line.trim());
			console.log('lines length is', lines.length);
			if (lines.length === 0) {
				throw new Error('File appears to be empty');
			}

			// Check if content has full structure
			const hasFullStructure = lines.some((line) => line.includes('[Header]'));
			console.log(`full structure:`, hasFullStructure);

			if (!hasFullStructure) {
				// Simple CSV format - process directly
				const inputHeaders = lines[0].split(',').map((header) => header.trim());
				if (!inputHeaders.length) {
					throw new Error('No headers found in the file');
				}

				// Define required columns (case-insensitive)
				const requiredColumns = ['sample_id', 'index2', 'index', 'sample_project'];
				const inputHeadersLower = inputHeaders.map((h) => h.toLowerCase());

				// Check for required columns
				const missingColumns = requiredColumns.filter(
					(required) => !inputHeadersLower.includes(required)
				);

				if (missingColumns.length > 0) {
					throw new Error(`Missing required columns: ${missingColumns.join(', ')}`);
				}

				// Create mapping while preserving original header cases
				const headerMap = new Map<number, number>();
				requiredColumns.forEach((required, index) => {
					const inputIndex = inputHeadersLower.findIndex((h) => h === required);
					if (inputIndex !== -1) {
						headerMap.set(inputIndex, index);
					}
				});

				// Use original input headers for the required columns
				headers = requiredColumns.map((required) => {
					const inputIndex = inputHeadersLower.findIndex((h) => h === required);
					return inputHeaders[inputIndex];
				});

				originalRows = lines
					.slice(1)
					.filter((line) => line.trim())
					.map((line) => {
						const cells = line.split(',').map((cell) => cell.trim());
						const reorderedCells = new Array(requiredColumns.length).fill('');

						headerMap.forEach((newIndex, oldIndex) => {
							if (cells[oldIndex]) {
								reorderedCells[newIndex] = cells[oldIndex];
							}
						});

						return reorderedCells;
					});

				if (originalRows.length === 0) {
					throw new Error('No data rows found in the file');
				}

				// Generate header section
				headerSection = [
					'[Header],,,',
					'FileFormatVersion,2,,',
					`RunName,${runName},,`,
					'InstrumentPlatform,NextSeq1k2k,,',
					'InstrumentType,NextSeq2000,,',
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
					'[BCLConvert_Data],,,'
				];
			} else {
				// Full structure format
				let dataSection = false;
				let dataLines: string[] = [];
				headerSection = [];
				let changedSampleIds: string[] = [];
				let duplicatedIndexesList: Record<string, string[]> = {};
				let foundDataSection = false;

				for (const line of lines) {
					// iterate through file line by line until reaches 'bcl convert data' and toggle datasection -> True
					if (line.includes('[BCLConvert_Data]')) {
						foundDataSection = true;
						dataSection = true;
						headerSection.push(line);
						continue;
					}

					// if in header section then push (append) lines to headersection variable
					if (!dataSection) {
						headerSection.push(line);

						// else start pushing (appending) to datalines variable
					} else if (line.trim()) {
						dataLines.push(line);
					}
				}

				if (!foundDataSection) {
					throw new Error('No [BCLConvert_Data] section found in the file');
				}

				if (dataLines.length === 0) {
					throw new Error('No data found after [BCLConvert_Data] section');
				}

				const inputHeaders = dataLines[0].split(',').map((header) => header.trim());

				// Define required columns (case-insensitive)
				const requiredColumns = ['sample_id', 'index2', 'index', 'sample_project'];
				console.log('required columns are:', requiredColumns);
				const inputHeadersLower = inputHeaders.map((h) => h.toLowerCase());
				console.log('found columns are:', inputHeadersLower);

				// Check for required columns
				const missingColumns = requiredColumns.filter(
					(required) => !inputHeadersLower.includes(required)
				);

				if (missingColumns.length > 0) {
					console.log('missing columns are:', missingColumns);
					throw new Error(`Missing required columns: ${missingColumns.join(', ')}`);
				}

				// added this
				headers = requiredColumns.map((required) => {
					const inputIndex = inputHeadersLower.findIndex((h) => h === required);
					return inputHeaders[inputIndex];
				});

				originalRows = dataLines
					.slice(1)
					.filter((line) => line.trim())
					.map((line) => line.split(',').map((cell) => cell.trim()));

				// Process Sample_ID column
				const processedRows = processRows(originalRows, headers);
				rows = processedRows.rows;
				changedSampleIds = processedRows.changedSampleIds;
				duplicatedIndexesList = processedRows.duplicatedIndexes;

				// Check if any sample IDs were changed and throw error
				if (changedSampleIds.length > 0) {
					throw new Error(
						`Invalid characters found in Sample_ID. The following sample IDs contain special characters: ${changedSampleIds.join(', ')}`
					);
				}

				// check if duplicated indexes exist
				if (Object.keys(duplicatedIndexesList).length > 0) {
					const duplicateDetails = Object.entries(duplicatedIndexesList)
						.map(([indexCombo, samples]) => `"${indexCombo}" used by: ${samples.join(', ')}`)
						.join('; ');
					throw new Error(`Duplicate index combinations found: ${duplicateDetails}`);
				}
			}

			// // Validate the content
			// console.log('entering validation');
			// result = validateSampleSheet2k(getFullContent());
			// error = null;
		} catch (e) {
			error = e instanceof Error ? e.message : 'An error occurred';
			result = null;
		}
	}

	// Helper function to get full content for validation
	function getFullContent(): string {
		return [...headerSection, headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
	}

	function downloadValidated(removeProject = false) {
		if (!headers.length || !rows.length) return;

		// Update headerSection with current configuration values
		headerSection = [
			'[Header],,,',
			'FileFormatVersion,2,,',
			`RunName,${runName},,`,
			'InstrumentPlatform,NextSeq1k2k,,',
			'InstrumentType,NextSeq2000,,',
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
			'[BCLConvert_Data],,,'
		];

		let downloadHeaders = [...headers];
		let downloadRows = rows.map((row) => [...row]);

		if (removeProject) {
			const projectColIndex = headers.findIndex((header) =>
				header.toLowerCase().includes('project')
			);

			if (projectColIndex !== -1) {
				downloadHeaders = headers.filter((_, i) => i !== projectColIndex);
				downloadRows = rows.map((row) => row.filter((_, i) => i !== projectColIndex));
			}
		}

		// Create CSV content with updated header section
		const csvContent = [
			...headerSection,
			downloadHeaders.join(','),
			...downloadRows.map((row) => {
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
		a.download = file
			? `${file.name.split('.')[0]}_validated${removeProject ? '_no_project' : ''}.csv`
			: `validated${removeProject ? '_no_project' : ''}_${date}.csv`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	function getSummaryStats() {
		if (!rows.length || !headers.length) return null;

		// Find Project column index
		const projectColIndex = headers.findIndex((header) => header.toLowerCase().includes('project'));

		if (projectColIndex === -1) return null;

		// Count samples per project
		const projectCounts = rows.reduce(
			(acc, row) => {
				const project = row[projectColIndex];
				acc[project] = (acc[project] || 0) + 1;
				return acc;
			},
			{} as Record<string, number>
		);

		return {
			totalSamples: rows.length,
			projectCounts
		};
	}

	function handleReverseComplementToggle(event: Event) {
		if (!rows.length) return;

		const index2ColIndex = headers.findIndex((h) => h.toLowerCase() === 'index2');

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
			<div class="mb-4 text-center">
				<h1 class="text-2xl font-bold tracking-tight text-gray-900">
					Sample Sheet Validator NextSeq 2000
				</h1>
			</div>
			<!-- Add this section before the Upload Section -->
			<div class="mb-4 rounded-lg bg-blue-50 p-4 shadow">
				<h3 class="mb-2 text-sm font-medium text-blue-800">Input Requirements:</h3>
				<ul class="list-inside list-disc space-y-1 text-sm text-blue-700">
					<li>File format: CSV or Excel (.xlsx, .xls)</li>
					<li>
						Required columns:
						<ul class="ml-4 list-inside list-disc">
							<li>Sample_ID - Sample identifier (special characters will be removed)</li>
							<li>Index - i7 index sequence</li>
							<li>Index2 - i5 index sequence (can be reverse complemented)</li>
							<li>Project - Project identifier</li>
						</ul>
					</li>
					<li>
						Optional columns:
						<ul class="ml-4 list-inside list-disc">
							<li>Sample_Name - Additional sample identifier</li>
							<li>Description - Sample description</li>
						</ul>
					</li>
					<li>Configuration: Run Name and Cycle settings must be specified</li>
					<li>
						Note: Index2 sequences can be reverse complemented using the toggle in configuration
					</li>
				</ul>
			</div>
			<!-- Upload Section -->
			<div class="rounded-lg bg-white p-4 shadow">
				<DragAndDrop on:fileDropped={(e) => handleFile(e.detail)} acceptTypes=".csv,.xlsx,.xls" />
			</div>

			<!-- Error Message -->
			{#if error}
				<div class="mb-4 border-l-4 border-red-400 bg-red-50 p-4">
					<div class="flex">
						<div class="flex-shrink-0">
							<svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
								<path
									fill-rule="evenodd"
									d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
									clip-rule="evenodd"
								/>
							</svg>
						</div>
						<div class="ml-3">
							<h3 class="text-sm font-medium text-red-800">Error Processing File</h3>
							<div class="mt-2 text-sm text-red-700">
								<p>{error}</p>
								{#if error === 'No data section found in the file'}
									<p class="mt-1">
										Please ensure your file contains the required [BCLConvert_Data] section or is in
										the correct CSV format with the required columns.
									</p>
								{/if}
							</div>
						</div>
					</div>
				</div>
			{:else}
				<!-- Configuration Section -->
				<div class="rounded-lg bg-white shadow">
					<!-- Configuration Header -->
					<button
						class="flex w-full items-center justify-between px-6 py-4 text-left"
						on:click={toggleConfiguration}
					>
						<h2 class="text-lg font-semibold text-gray-900">Configuration</h2>
						<svg
							class={`h-5 w-5 transition-transform duration-200 ${$configurationOpen ? 'rotate-180 transform' : ''}`}
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
						<div class="space-y-8 px-6 pb-6 transition-all duration-200">
							<div class="grid grid-cols-1 gap-8 lg:grid-cols-2">
								<!-- Left Column -->
								<div class="space-y-6">
									<div class="rounded-lg bg-gray-50 p-4">
										<h3 class="mb-4 text-sm font-medium text-gray-900">Run Information</h3>
										<div class="space-y-4">
											<div>
												<label class="mb-1 block text-sm font-medium text-gray-700">Run Name</label>
												<input
													type="text"
													bind:value={runName}
													class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
													placeholder="Enter run name"
												/>
											</div>
											<div>
												<label class="mb-1 block text-sm font-medium text-gray-700"
													>BCL Convert Version</label
												>
												<input
													type="text"
													bind:value={bclVersion}
													class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
													placeholder="e.g., 4.2.7"
												/>
											</div>
										</div>
									</div>

									<div class="rounded-lg bg-gray-50 p-4">
										<h3 class="mb-4 text-sm font-medium text-gray-900">Adapter Sequences</h3>
										<div class="space-y-4">
											<div>
												<label class="mb-1 block text-sm font-medium text-gray-700">
													Adapter Read 1
													<span class="ml-1 text-xs text-gray-500">(Universal)</span>
												</label>
												<input
													type="text"
													bind:value={adapterRead1}
													class="block w-full rounded-md border-gray-300 font-mono shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
												/>
											</div>
											<div>
												<label class="mb-1 block text-sm font-medium text-gray-700">
													Adapter Read 2
													<span class="ml-1 text-xs text-gray-500">(Universal)</span>
												</label>
												<input
													type="text"
													bind:value={adapterRead2}
													class="block w-full rounded-md border-gray-300 font-mono shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
												/>
											</div>
										</div>
									</div>
								</div>

								<!-- Right Column -->
								<div class="space-y-6">
									<div class="rounded-lg bg-gray-50 p-4">
										<h3 class="mb-4 text-sm font-medium text-gray-900">Cycle Settings</h3>
										<div class="grid grid-cols-2 gap-4">
											<div>
												<label class="mb-1 block text-sm font-medium text-gray-700">Read 1</label>
												<input
													type="number"
													bind:value={read1Cycle}
													class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
												/>
											</div>
											<div>
												<label class="mb-1 block text-sm font-medium text-gray-700">Read 2</label>
												<input
													type="number"
													bind:value={read2Cycle}
													class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
												/>
											</div>
											<div>
												<label class="mb-1 block text-sm font-medium text-gray-700">Index 1</label>
												<input
													type="number"
													bind:value={index1Cycle}
													class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
												/>
											</div>
											<div>
												<label class="mb-1 block text-sm font-medium text-gray-700">Index 2</label>
												<input
													type="number"
													bind:value={index2Cycle}
													class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
												/>
											</div>
										</div>
									</div>

									<div class="rounded-lg bg-gray-50 p-4">
										<h3 class="mb-4 text-sm font-medium text-gray-900">Barcode Mismatches</h3>
										<div class="grid grid-cols-2 gap-4">
											<div>
												<label class="mb-1 block text-sm font-medium text-gray-700">Index 1</label>
												<input
													type="number"
													bind:value={barcodeMismatchesIndex1}
													class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
												/>
											</div>
											<div>
												<label class="mb-1 block text-sm font-medium text-gray-700">Index 2</label>
												<input
													type="number"
													bind:value={barcodeMismatchesIndex2}
													class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
												/>
											</div>
										</div>
									</div>

									<div class="rounded-lg bg-gray-50 p-4">
										<h3 class="mb-4 text-sm font-medium text-gray-900">Additional Settings</h3>
										<div>
											<label class="relative inline-flex cursor-pointer items-center">
												<input
													type="checkbox"
													bind:checked={noLaneSplitting}
													class="peer sr-only"
												/>
												<div
													class="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:start-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rtl:peer-checked:after:-translate-x-full"
												></div>
												<span class="ms-3 text-sm font-medium text-gray-900">No Lane Splitting</span
												>
											</label>
										</div>
									</div>

									<div class="rounded-lg bg-gray-50 p-4">
										<h3 class="mb-4 text-sm font-medium text-gray-900">Index Settings</h3>
										<div>
											<label class="relative inline-flex cursor-pointer items-center">
												<input
													type="checkbox"
													bind:checked={$reverseComplement2k}
													on:change={handleReverseComplementToggle}
													class="peer sr-only"
												/>
												<div
													class="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:start-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rtl:peer-checked:after:-translate-x-full"
												></div>
												<span class="ms-3 text-sm font-medium text-gray-900"
													>Reverse Complement Index2</span
												>
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
						<div class="rounded-lg bg-white p-4 shadow">
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
										<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
											/>
										</svg>
										Download Full Sheet
									</button>
									<button
										on:click={() => downloadValidated(true)}
										class="inline-flex items-center justify-center rounded-md bg-gray-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-600"
									>
										<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
											/>
										</svg>
										Download Without Project
									</button>
								</div>
							</div>
						</div>
					{/if}
				{/if}

				<!-- Table Section -->
				<div class="rounded-lg bg-white shadow ring-1 ring-gray-900/5">
					<div class="border-b border-gray-200 px-4 py-2">
						<h2 class="text-sm font-semibold text-gray-900">Sample Sheet Content</h2>
						<p class="text-xs text-gray-500">Headers: {headers.length}, Rows: {rows.length}</p>
					</div>
					<Table {headers} {rows} />
				</div>
			{/if}

			<!-- Duplicate Indexes Warning -->
			{#if result?.duplicatedIndexes && Object.keys(result.duplicatedIndexes).length > 0}
				<div class="rounded-lg bg-yellow-50 p-4 shadow ring-1 ring-yellow-900/5">
					<h3 class="text-sm font-medium text-yellow-800">
						Warning: Duplicate Index Combinations Found
					</h3>
					<div class="mt-2 text-sm text-yellow-700">
						<ul class="list-disc space-y-1 pl-5">
							{#each Object.entries(result.duplicatedIndexes) as [indexCombo, samples]}
								<li>
									Index combination "{indexCombo}" is used by samples: {samples.join(', ')}
								</li>
							{/each}
						</ul>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>
