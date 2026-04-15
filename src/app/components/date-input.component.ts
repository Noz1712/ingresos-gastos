import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, forwardRef, Input, OnChanges, Output, SimpleChanges, ViewChild } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { displayDateToIso, formatDateInputMask, isoDateToDisplay } from '../utils/date-utils';

@Component({
  selector: 'app-date-input',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="date-input-wrap">
      <input
        class="date-text-input"
        type="text"
        inputmode="numeric"
        autocomplete="off"
        placeholder="DD/MM/YYYY"
        [value]="displayValue"
        [disabled]="disabled"
        (click)="openNativePicker()"
        (input)="onInput($any($event.target).value)"
        (blur)="onBlur()"
      />

      <button type="button" class="calendar-button" [disabled]="disabled" (click)="openNativePicker()" aria-label="Abrir calendario">
        <span class="calendar-icon" aria-hidden="true">📅</span>
      </button>

      <input
        #nativePicker
        class="native-date-picker"
        type="date"
        tabindex="-1"
        [value]="modelValue"
        [disabled]="disabled"
        (change)="onNativePickerChange($any($event.target).value)"
      />
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .date-input-wrap {
      position: relative;
      display: grid;
      align-items: center;
    }

    .calendar-button {
      position: absolute;
      right: 0.45rem;
      z-index: 1;
      width: 2rem;
      height: 2rem;
      border: 0;
      border-radius: 999px;
      background: transparent;
      display: grid;
      place-items: center;
      cursor: pointer;
      color: inherit;
    }

    .calendar-button:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }

    .calendar-button:hover {
      background: rgba(126, 180, 234, 0.12);
    }

    .calendar-icon {
      font-size: 1rem;
      line-height: 1;
      opacity: 0.76;
    }

    .native-date-picker {
      position: absolute;
      width: 0;
      height: 0;
      opacity: 0;
      pointer-events: none;
    }

    .date-text-input {
      width: 100%;
      border: 1px solid #cfe2f6;
      border-radius: 1rem;
      padding: 0.9rem 2.7rem 0.9rem 1rem;
      min-height: 2.85rem;
      background: #fbfdff;
      color: var(--text-color);
      font: inherit;
      transition: border-color 140ms ease, box-shadow 140ms ease, background 140ms ease;
    }

    .date-text-input:focus {
      outline: none;
      border-color: #7eb4ea;
      box-shadow: var(--focus-ring);
      background: #ffffff;
    }
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DateInputComponent),
      multi: true,
    },
  ],
})
export class DateInputComponent implements ControlValueAccessor, OnChanges {
  @ViewChild('nativePicker') private nativePicker?: ElementRef<HTMLInputElement>;

  @Input() value = '';
  @Output() readonly valueChange = new EventEmitter<string>();

  protected displayValue = '';
  protected disabled = false;

  protected modelValue = '';
  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  ngOnChanges(changes: SimpleChanges): void {
    if ('value' in changes) {
      this.setModelValue(this.value);
    }
  }

  writeValue(value: string | null | undefined): void {
    this.setModelValue(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  protected onInput(rawValue: string): void {
    this.displayValue = formatDateInputMask(rawValue);

    if (!this.displayValue) {
      this.modelValue = '';
      this.emitValue('');
      return;
    }

    const iso = displayDateToIso(this.displayValue);
    if (iso) {
      this.modelValue = iso;
      this.emitValue(iso);
    }
  }

  protected onBlur(): void {
    this.onTouched();

    if (!this.displayValue) {
      this.modelValue = '';
      this.emitValue('');
      return;
    }

    const iso = displayDateToIso(this.displayValue);
    if (iso) {
      this.modelValue = iso;
      this.displayValue = isoDateToDisplay(iso);
      this.emitValue(iso);
      return;
    }

    this.displayValue = this.modelValue ? isoDateToDisplay(this.modelValue) : '';
  }

  protected openNativePicker(): void {
    const picker = this.nativePicker?.nativeElement;
    if (!picker || this.disabled) {
      return;
    }

    if (this.modelValue) {
      picker.value = this.modelValue;
    }

    const pickerApi = picker as HTMLInputElement & { showPicker?: () => void };
    if (typeof pickerApi.showPicker === 'function') {
      pickerApi.showPicker();
      return;
    }

    picker.focus();
    picker.click();
  }

  protected onNativePickerChange(rawValue: string): void {
    const iso = String(rawValue || '').trim();
    if (!iso) {
      this.modelValue = '';
      this.displayValue = '';
      this.emitValue('');
      return;
    }

    this.modelValue = iso;
    this.displayValue = isoDateToDisplay(iso);
    this.emitValue(iso);
    this.onTouched();
  }

  private setModelValue(rawValue: string): void {
    this.modelValue = typeof rawValue === 'string' ? rawValue : '';
    this.displayValue = this.modelValue ? isoDateToDisplay(this.modelValue) : '';
  }

  private emitValue(value: string): void {
    this.onChange(value);
    this.valueChange.emit(value);
  }
}
