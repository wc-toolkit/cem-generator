/**
 * A component documented with custom tags.
 * @owner design-system
 */
<svelte:options customElement="custom-tags-element" />

<script lang="ts">
  /**
   * Label shown in the element.
   * @owner content-team
   */
  export let label: string = "Hello";

  interface Props {
    /** Count shown beside the label. @badge small */
    count?: number;
  }

  let { count = 1 }: Props = $props();
</script>

<span>{label} {count}</span>
