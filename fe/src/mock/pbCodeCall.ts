import type{ pbCall } from "../pbCall";
export const mockPbCall: pbCall = {
    async call(_link: string) {
        void _link;
        return `<div class="code-block">
  <div class="code-header">
    <div class="dots">
      <span class="red"></span>
      <span class="yellow"></span>
      <span class="green"></span>
    </div>

    <span class="file-name">hello.c</span>
  </div>

  <pre><code>
#include &lt;stdio.h&gt;

int main() {
    printf("Hello, World!\n");

    return 0;
}
  </code></pre>
</div>
`;
    }
};
