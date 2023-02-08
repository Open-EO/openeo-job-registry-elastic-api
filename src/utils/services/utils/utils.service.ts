import { Injectable } from '@nestjs/common';

@Injectable()
export class UtilsService {
  public static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
