'use strict';

const { Plugin, MarkdownView, PluginSettingTab, Setting } = require('obsidian');
const { ViewPlugin, Decoration, WidgetType } = require('@codemirror/view');
const { RangeSetBuilder } = require('@codemirror/state');

class EmojiWidget extends WidgetType {
  constructor(variant) { super(); this.variant = variant; }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'inline-variant-emoji';
    span.textContent = this.variant.emoji;
    return span;
  }
  ignoreEvent() { return true; }
}

const DEFAULT_VARIANTS = [
  { enabled: true, name: 'Question',      open: '--?', close: '?', emoji: '❓', emojiPosition: 'trailing', textColor: '#FF5555', backgroundColor: '#FF5555', backgroundOpacity: 0.15, fontWeight: '600', borderRadius: '3px', padding: '0 2px' },
  { enabled: true, name: 'Exclamation',   open: '--?', close: '!', emoji: '❗️', emojiPosition: 'trailing', textColor: '#FF7700', backgroundColor: '#FF7700', backgroundOpacity: 0.15, fontWeight: '600', borderRadius: '3px', padding: '0 2px' },
  { enabled: true, name: 'Clarification', open: '--?', close: ':', emoji: '⚠️', emojiPosition: 'trailing', textColor: '#FFAA00', backgroundColor: '#FFAA00', backgroundOpacity: 0.15, fontWeight: '600', borderRadius: '3px', padding: '0 2px' },
  { enabled: false, name: 'Variant 4',    open: '',    close: '', emoji: '',    emojiPosition: 'trailing', textColor: '#888888', backgroundColor: '#888888', backgroundOpacity: 0.15, fontWeight: '400', borderRadius: '2px', padding: '0 2px' },
  { enabled: false, name: 'Variant 5',    open: '',    close: '', emoji: '',    emojiPosition: 'trailing', textColor: '#888888', backgroundColor: '#888888', backgroundOpacity: 0.15, fontWeight: '400', borderRadius: '2px', padding: '0 2px' }
];

const DEFAULT_SETTINGS = { disableInSourceMode: false, variants: DEFAULT_VARIANTS };

class InlineVariantsPlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.injectGlobalStyles();
    this.registerEditorExtension(this.createCmPlugin());
    this.registerMarkdownPostProcessor(root => this.processPreview(root));
    this.addSettingTab(new VariantsSettingTab(this.app, this));
  }

  injectGlobalStyles() {
    const s = document.createElement('style');
    s.textContent = `
.inline-variant-highlight { display:inline; }
.inline-variant-emoji { user-select:none; margin:0 2px; }
`;
    document.head.appendChild(s);
    this.register(() => s.remove());
  }

  createCmPlugin() {
    const plugin = this;
    return ViewPlugin.fromClass(class {
      constructor(view) { this.view = view; this.decors = this.buildDecors(); }
      update(u) { if (u.docChanged || u.viewportChanged || u.selectionSet) this.decors = this.buildDecors(); }

      buildDecors() {
        const ops = [];
        const md = plugin.app.workspace.getActiveViewOfType(MarkdownView);
        const inSource = md && md.getState().mode === 'source' && md.getState().source === true;
        if (plugin.settings.disableInSourceMode && inSource) return new RangeSetBuilder().finish();

        const { state } = this.view;
        const sel = state.selection;

        for (const v of plugin.settings.variants) {
          if (!v.enabled || !v.open || !v.close) continue;
          const escO = v.open.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          const escC = v.close.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          const prefix = v.open.slice(0, v.open.length - v.close.length).replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          const regex = new RegExp(`${escO}(\\s*)(.+?)(\\s*)(?<!${prefix})${escC}`, 'g');

          for (const { from, to } of this.view.visibleRanges) {
            const text = state.doc.sliceString(from, to);
            let m;
            regex.lastIndex = 0;
            while ((m = regex.exec(text))) {
              const fullStart = from + m.index;
              const fullLen = m[0].length;
              const innerContent = m[2];
              const leadSpaces = m[1].length;
              const trailSpaces = m[3].length;
              const innerStart = fullStart + v.open.length + leadSpaces;
              const innerEnd = innerStart + innerContent.length;
              const fullEnd = fullStart + fullLen;

              if (sel.ranges.some(r => r.head >= fullStart && r.head <= fullEnd)) continue;

              ops.push({ from: fullStart, to: innerStart, deco: Decoration.replace({}) });
              if (v.emoji && v.emojiPosition === 'leading') ops.push({ from: innerStart, to: innerStart, deco: Decoration.widget({ widget: new EmojiWidget(v) }) });

              const [r,g,b] = v.backgroundColor.match(/[A-Fa-f0-9]{2}/g).map(h => parseInt(h,16));
              const bg = `rgba(${r},${g},${b},${v.backgroundOpacity})`;
              ops.push({ from: innerStart, to: innerEnd, deco: Decoration.mark({ class: 'inline-variant-highlight', attributes: { style: `color:${v.textColor};background-color:${bg};font-weight:${v.fontWeight};border-radius:${v.borderRadius};padding:${v.padding};` } }) });

              if (v.emoji && v.emojiPosition === 'trailing') ops.push({ from: innerEnd, to: innerEnd, deco: Decoration.widget({ widget: new EmojiWidget(v) }) });
              ops.push({ from: innerEnd, to: fullEnd, deco: Decoration.replace({}) });
            }
          }
        }

        ops.sort((a,b) => a.from - b.from || a.to - b.to);
        const builder = new RangeSetBuilder();
        for (const o of ops) builder.add(o.from, o.to, o.deco);
        return builder.finish();
      }
    }, { decorations: v => v.decors });
  }

  processPreview(root) {
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (!n.parentElement.closest('pre, code')) {
        for (const v of this.settings.variants) {
          if (v.enabled && v.open && v.close) {
            const escO = v.open.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            const escC = v.close.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            const prefix = v.open.slice(0, v.open.length - v.close.length).replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            const rg = new RegExp(`${escO}(\\s*)(.+?)(\\s*)(?<!${prefix})${escC}`, 'g');
            if (rg.test(n.textContent)) { nodes.push(n); break; }
          }
        }
      }
    }

    for (const n of nodes) {
      const text = n.textContent;
      const frag = document.createDocumentFragment();
      let idx = 0;
      const matches = [];

      this.settings.variants.forEach(v => {
        if (!v.enabled || !v.open || !v.close) return;
        const escO = v.open.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const escC = v.close.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const prefix = v.open.slice(0, v.open.length - v.close.length).replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const rg = new RegExp(`${escO}(\\s*)(.+?)(\\s*)(?<!${prefix})${escC}`, 'g');
        let m;
        while ((m = rg.exec(text))) matches.push({ start: m.index, len: m[0].length, lead: m[1].length, content: m[2], trail: m[3].length, variant: v });
      });
      matches.sort((a,b) => a.start - b.start);

      for (const m of matches) {
        if (m.start < idx) continue;
        if (m.start > idx) frag.append(document.createTextNode(text.slice(idx, m.start)));
        const v = m.variant;
        if (v.emoji && v.emojiPosition==='leading') frag.append(new EmojiWidget(v).toDOM());
        const span = document.createElement('span');
        const [r,g,b] = v.backgroundColor.match(/[A-Fa-f0-9]{2}/g).map(h=>parseInt(h,16));
        span.style.cssText = `color:${v.textColor};background-color:rgba(${r},${g},${b},${v.backgroundOpacity});font-weight:${v.fontWeight};border-radius:${v.borderRadius};padding:${v.padding};`;
        span.textContent = m.content;
        frag.append(span);
        if (v.emoji && v.emojiPosition==='trailing') frag.append(new EmojiWidget(v).toDOM());
        idx = m.start + m.len;
      }
      if (idx < text.length) frag.append(document.createTextNode(text.slice(idx)));
      n.parentNode.replaceChild(frag, n);
    }
  }

  onunload() {}
}

class VariantsSettingTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Inline Variants' });
    new Setting(containerEl)
      .setName('Disable in Source Mode')
      .setDesc('Скрывать все варианты в чистом Source-режиме')
      .addToggle(t => t.setValue(this.plugin.settings.disableInSourceMode).onChange(async v=>{ this.plugin.settings.disableInSourceMode=v; await this.plugin.saveData(this.plugin.settings);}));
    this.plugin.settings.variants.forEach((v,i)=>{
      containerEl.createEl('h3',{ text:`Variant ${i+1}: ${v.name}` });
      new Setting(containerEl).addToggle(t=>t.setValue(v.enabled).setTooltip('Вкл/выкл').onChange(async on=>{ v.enabled=on; await this.plugin.saveData(this.plugin.settings); this.display(); }));
      if(!v.enabled) return;
      new Setting(containerEl).setName('Opening marker').addText(txt=>txt.setPlaceholder('--?').setValue(v.open).onChange(async val=>{ v.open=val; await this.plugin.saveData(this.plugin.settings);}));
      new Setting(containerEl).setName('Closing marker').addText(txt=>txt.setPlaceholder('?').setValue(v.close).onChange(async val=>{ v.close=val.slice(0,1); await this.plugin.saveData(this.plugin.settings);}));
      new Setting(containerEl).setName('Emoji').addText(txt=>txt.setPlaceholder('❓').setValue(v.emoji).onChange(async val=>{ v.emoji=val; await this.plugin.saveData(this.plugin.settings);}));
      new Setting(containerEl).setName('Emoji position').addDropdown(dd=>dd.addOptions({ leading:'Leading', trailing:'Trailing' }).setValue(v.emojiPosition).onChange(async val=>{ v.emojiPosition=val; await this.plugin.saveData(this.plugin.settings);}));
      new Setting(containerEl).setName('Text color').addColorPicker(cp=>cp.setValue(v.textColor).onChange(async val=>{ v.textColor=val; await this.plugin.saveData(this.plugin.settings);}));
      new Setting(containerEl).setName('Background color').addColorPicker(cp=>cp.setValue(v.backgroundColor).onChange(async val=>{ v.backgroundColor=val; await this.plugin.saveData(this.plugin.settings);}));
      new Setting(containerEl).setName('Background opacity').addSlider(sl=>sl.setLimits(0,1,0.05).setValue(v.backgroundOpacity).onChange(async val=>{ v.backgroundOpacity=val; await this.plugin.saveData(this.plugin.settings);}));
      new Setting(containerEl).setName('Font weight').addText(txt=>txt.setValue(v.fontWeight).onChange(async val=>{ v.fontWeight=val; await this.plugin.saveData(this.plugin.settings);}));
      new Setting(containerEl).setName('Border radius').addText(txt=>txt.setValue(v.borderRadius).onChange(async val=>{ v.borderRadius=val; await this.plugin.saveData(this.plugin.settings);}));
      new Setting(containerEl).setName('Padding').addText(txt=>txt.setValue(v.padding).onChange(async val=>{ v.padding=val; await this.plugin.saveData(this.plugin.settings);}));
    });
  }
}

module.exports = InlineVariantsPlugin;
