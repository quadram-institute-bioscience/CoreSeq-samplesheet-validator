<script lang="ts">
    import { onMount } from 'svelte';
    
    onMount(() => {
        window.location.href = '/nextseq2k';
    });
</script>

<svelte:head>
    <meta http-equiv="refresh" content="0;url=/nextseq2k">
</svelte:head>

<div class="flex items-center justify-center min-h-screen">
    <p class="text-gray-500">Redirecting to NextSeq 2000...</p>
</div>