<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    
    export let acceptTypes = '.csv'; // Default to CSV, but can be overridden
    
    const dispatch = createEventDispatcher();
    let isDragging = false;
    let dropzone: HTMLElement;
    let fileInput: HTMLInputElement;

    function handleDragEnter(e: DragEvent) {
        e.preventDefault();
        isDragging = true;
    }

    function handleDragLeave(e: DragEvent) {
        e.preventDefault();
        isDragging = false;
    }

    function handleDragOver(e: DragEvent) {
        e.preventDefault();
        isDragging = true;
    }

    function handleDrop(e: DragEvent) {
        e.preventDefault();
        isDragging = false;
        
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
            const file = files[0];
            const fileExtension = file.name.split('.').pop()?.toLowerCase();
            const acceptedExtensions = acceptTypes.split(',').map(type => 
                type.trim().replace('.', '').toLowerCase()
            );
            
            if (acceptedExtensions.includes(fileExtension || '')) {
                dispatch('fileDropped', file);
            } else {
                alert(`Please upload a file with one of these extensions: ${acceptTypes}`);
            }
        }
    }

    function handleClick() {
        fileInput.click();
    }

    function handleFileInput(e: Event) {
        const files = (e.target as HTMLInputElement).files;
        if (files && files.length > 0) {
            dispatch('fileDropped', files[0]);
        }
    }
</script>

<div
    class="flex min-h-[120px] w-full items-center justify-center"
    bind:this={dropzone}
    on:dragenter={handleDragEnter}
    on:dragleave={handleDragLeave}
    on:dragover={handleDragOver}
    on:drop={handleDrop}
    on:click={handleClick}
    on:keydown={(e) => e.key === 'Enter' && handleClick()}
    role="button"
    tabindex="0"
    aria-label="File upload drop zone"
>
    <input
        type="file"
        accept={acceptTypes}
        class="hidden"
        bind:this={fileInput}
        on:change={handleFileInput}
    />
    
    <div
        class={`group relative w-full cursor-pointer rounded-lg border-2 border-dashed p-4 text-center transition-all duration-300 ease-in-out
        ${isDragging 
            ? 'border-blue-500 bg-blue-50' 
            : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50'}`}
    >
        <div class="absolute inset-0 -z-10 rounded-lg transition-all duration-300 group-hover:bg-blue-50/50"></div>
        <slot>
            <div class="text-center flex items-center justify-center gap-4">
                <svg
                    class="h-8 w-8 text-blue-500/80"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="1.5"
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    ></path>
                </svg>
                <div class="text-left">
                    <p class="text-sm font-medium text-gray-900">
                        Drop your sample sheet here
                    </p>
                    <p class="text-xs text-gray-500">
                        Accepted formats: {acceptTypes}
                    </p>
                </div>
            </div>
        </slot>
    </div>
</div> 