/** Running code is on unless the build says otherwise (the public test host turns it off). */
export const RUN_ENABLED = import.meta.env.VITE_RUN_ENABLED !== "false";
