/**
 * Accessor member fixture.
 * @tag accessor-members
 */
export class AccessorMembers extends HTMLElement {
  /**
   * Read-only computed label.
   * @returns {string}
   */
  get label() {
    return "ready";
  }

  /**
   * Read/write value.
   * @returns {string}
   */
  get value() {
    return this._value;
  }

  /** @param {string} value */
  set value(value) {
    this._value = value;
  }

  _value = "";
}

/**
 * Accessor inheritance base fixture.
 * @tag accessor-base
 */
export class AccessorBase extends HTMLElement {
  /**
   * Inherited getter-only member.
   * @returns {string}
   */
  get inheritedGetterOnly() {
    return "base";
  }

  /**
   * Overridden read/write member.
   * @returns {string}
   */
  get overridePair() {
    return this._value;
  }

  /** @param {string} value */
  set overridePair(value) {
    this._value = value;
  }

  /**
   * Getter-only member overridden by a setter.
   * @returns {string}
   */
  get setterOverride() {
    return this._value;
  }

  /**
   * Inherited read/write member.
   * @returns {string}
   */
  get inheritedPair() {
    return this._value;
  }

  /** @param {string} value */
  set inheritedPair(value) {
    this._value = value;
  }

  /**
   * Documented accessor pair.
   * @summary Pair summary.
   * @attribute pair-value
   * @default "pair"
   * @reflect
   * @returns {string}
   */
  get documentedPair() {
    return this._value;
  }

  /** @param {string} value */
  set documentedPair(value) {
    this._value = value;
  }

  _value = "";
}

/**
 * Inherits getter-only member from the base.
 * @tag accessor-inherits-getter
 */
export class AccessorInheritsGetter extends AccessorBase {}

/**
 * Overrides a base get/set pair with only a getter.
 * @tag accessor-overrides-getter
 */
export class AccessorOverridesGetter extends AccessorBase {
  /**
   * Override getter only.
   * @returns {string}
   */
  get overridePair() {
    return "override";
  }
}

/**
 * Overrides a base getter-only member with only a setter.
 * @tag accessor-overrides-setter
 */
export class AccessorOverridesSetter extends AccessorBase {
  /** @param {string} value */
  set setterOverride(value) {
    this._value = value;
  }
}

/**
 * Inherits a read/write pair unchanged.
 * @tag accessor-inherits-pair
 */
export class AccessorInheritsPair extends AccessorBase {}

customElements.define("accessor-members", AccessorMembers);
customElements.define("accessor-base", AccessorBase);
customElements.define("accessor-inherits-getter", AccessorInheritsGetter);
customElements.define("accessor-overrides-getter", AccessorOverridesGetter);
customElements.define("accessor-overrides-setter", AccessorOverridesSetter);
customElements.define("accessor-inherits-pair", AccessorInheritsPair);
