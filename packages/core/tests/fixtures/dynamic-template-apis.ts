const dynamicPart = "dynamic-part";
const dynamicSlot = "dynamic-slot";
const dynamicStateSource = ".states.add('${dynamicState}')";

export class DynamicTemplateApisElement extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <slot name="${dynamicSlot}"></slot>
      <slot name="static-slot"></slot>
      <div part="section ${dynamicPart}"></div>
      <div part="${dynamicPart}"></div>
      ${dynamicStateSource}
    `;
  }
}

customElements.define("dynamic-template-apis", DynamicTemplateApisElement);
