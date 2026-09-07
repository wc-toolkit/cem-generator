<svelte:options customElement="solid-greeting" />

<script lang="ts">
  /** Name shown by the greeting. */
  export let name: string = "World";
  export let count: number = 1;

  $host().dispatchEvent(new CustomEvent("greet"));
</script>

<style>
  :host { /** Greeting color. */ --greeting-color: steelblue; }
</style>

<!-- Greeting label -->
<span part="label"><!-- Label content --><slot name="label"></slot></span>
<!-- Main content -->
<slot></slot>
