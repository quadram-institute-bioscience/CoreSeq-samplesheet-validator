<script lang="ts">
    import '../app.css';
    import Footer from '$lib/components/Footer.svelte';
</script>

<div class="min-h-screen flex flex-col">
    <main class="flex-grow">
        <slot />
    </main>
    <Footer />
</div>