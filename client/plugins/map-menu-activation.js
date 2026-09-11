export const manifest = {
  id: "map-menu-activation",
  requires: ["keyboard-input", "battle-royale-navigation-client"],
};

export async function setup(ctx) {
  const input = ctx.services.get("input");
  const originalSample = input.sample.bind(input);

  input.sample = () => {
    const sampled = originalSample();
    if (!sampled.navigationSelectTargetId) return sampled;
    return {
      ...sampled,
      navigationActivateSelected: true,
    };
  };
}
