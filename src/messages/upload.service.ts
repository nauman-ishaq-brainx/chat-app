import { Injectable } from '@nestjs/common';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class UploadService {
  private readonly uploadPath = './uploads';

  constructor() {
    // Ensure upload directory exists
    if (!fs.existsSync(this.uploadPath)) {
      fs.mkdirSync(this.uploadPath, { recursive: true });
    }
  }

  async uploadFile(file: Express.Multer.File): Promise<string | null> {
    if (!file) {
      return null;
    }

    // Generate unique filename
    const fileExtension = extname(file.originalname);
    const fileName = `${uuidv4()}${fileExtension}`;
    const filePath = path.join(this.uploadPath, fileName);

    // Write file to disk
    fs.writeFileSync(filePath, file.buffer);

    // Return the file URL (relative to your server)
    return `/uploads/${fileName}`;
  }
}
