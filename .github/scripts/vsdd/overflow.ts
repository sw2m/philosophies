export default {
  blocking: (overflow: unknown[], output: unknown) => {
    for (const item of overflow) {
      if (typeof item === "object" && item !== null) {
        (item as Record<string, unknown>).severity = "advisory";
        (item as Record<string, unknown>).demoted = true;
      }
    }
  },
};
