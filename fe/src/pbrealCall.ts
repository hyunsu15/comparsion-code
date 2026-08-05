import type { pbCall } from "./pbCall";

export const pbRealCall: pbCall = {
  call: async (link :string) => {
    const response = await fetch(link);

    const responseJson = await response.json();

    const text = responseJson.code;
    return text;
  },
};