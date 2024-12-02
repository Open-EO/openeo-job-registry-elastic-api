import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class CachingService {
  private logger = new Logger('CachingService');

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  /**
   * Retrieve an element from the cache. If the element could not be found or an error occured, it will return undefined.
   * @param key - Key to use for storing the results
   */
  public async checkCache<T>(key: string): Promise<T | undefined> {
    try {
      this.logger.debug(`Checking cache for key: ${key}`);
      const result = await this.cacheManager.get<T>(key);
      if (result) {
        this.logger.debug(`Found result in cache`);
      } else {
        this.logger.debug('Could not find entry in cache');
      }
      return result;
    } catch (error) {
      this.logger.error(`Could not query cache: ${JSON.stringify(error)}`);
      return undefined;
    }
  }

  /**
   * Store a result into the cache of the application
   * @param key - Key used to store the value in the cache.
   * @param value - Value to store in the cache.
   */
  public async store(key: string, value: any) {
    try {
      this.logger.debug(`Storing body cache for key: ${key}`);
      await this.cacheManager.set(key, value);
    } catch (error) {
      this.logger.error(
        `Could not store value in cache cache: ${JSON.stringify(error)}`,
      );
    }
  }
}
