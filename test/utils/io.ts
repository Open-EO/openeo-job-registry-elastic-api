import * as fs from 'fs';
import { Job } from '../../src/jobs/models/job.dto';

export const readJobFile = (filename: string): Job =>
  JSON.parse(fs.readFileSync(`./test/data/${filename}`, 'utf8')) as Job;
