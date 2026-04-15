import { Pipe, PipeTransform } from '@angular/core';
import { formatMoney } from '../models/currency.model';

@Pipe({
  name: 'money',
  standalone: true,
})
export class MoneyPipe implements PipeTransform {
  transform(value: number | null | undefined, currencyCode?: string | null): string {
    return formatMoney(Number(value || 0), currencyCode);
  }
}
