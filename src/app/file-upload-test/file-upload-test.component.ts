import { Component } from '@angular/core';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-file-upload-test',
  templateUrl: './file-upload-test.component.html',
  styleUrls: ['./file-upload-test.component.css']
})
export class FileUploadTestComponent {

  isVisible = true;           // Overlay visibility
  selectedFile!: File;

  uploading = false;
  progress = 0;

  uploadCompletedFlag = false;
  showOpenBtn = false;

  tableHeaders: string[] = [];
  tableRows: any[] = [];

  /* ---------- FILE HANDLING ---------- */
  onFileSelected(event: any) {
    const file = event.target.files[0];
    this.handleFile(file);
  }

  handleFile(file: File | null) {
    if (!file) return;

    const isJson = file.name.toLowerCase().endsWith('.json');
    const isExcel =
      file.type === 'application/vnd.ms-excel' ||
      file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    if (isJson || isExcel) {
      this.selectedFile = file;
      this.resetStatus();
    } else {
      alert('Only JSON or Excel files allowed');
    }
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    const file = event.dataTransfer!.files[0];
    this.handleFile(file);
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
  }

  /* ---------- UPLOAD SIMULATION ---------- */
  uploadFile() {
    if (!this.selectedFile) return;

    this.uploading = true;
    this.progress = 0;
    this.uploadCompletedFlag = false;
    this.showOpenBtn = false;

    const interval = setInterval(() => {
      this.progress += 10;

      if (this.progress >= 100) {
        clearInterval(interval);
        this.uploading = false;
        this.uploadCompletedFlag = true;
        this.showOpenBtn = true;
      }
    }, 300);
  }

  /* ---------- OPEN BUTTON ---------- */
  openPage() {
    this.isVisible = false;
    this.readFile(this.selectedFile);
  }

  /* ---------- READ FILE ---------- */
  readFile(file: File) {
    if (file.name.toLowerCase().endsWith('.json')) {
      this.readJson(file);
    } else {
      this.readExcel(file);
    }
  }

  readJson(file: File) {
    const reader = new FileReader();
    reader.onload = (e: any) => {
      const data = JSON.parse(e.target.result);
      this.prepareTable(data);
    };
    reader.readAsText(file);
  }

  readExcel(file: File) {
    const reader = new FileReader();
    reader.onload = (e: any) => {
      const workbook = XLSX.read(e.target.result, { type: 'binary' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(sheet);
      this.prepareTable(data);
    };
    reader.readAsBinaryString(file);
  }

  /* ---------- TABLE ---------- */
  prepareTable(data: any) {
    if (Array.isArray(data) && data.length) {
      this.tableHeaders = Object.keys(data[0]);
      this.tableRows = data;
    } else {
      this.tableHeaders = ['Key', 'Value'];
      this.tableRows = Object.keys(data).map(k => ({
        Key: k,
        Value: JSON.stringify(data[k])
      }));
    }
  }

  resetStatus() {
    this.uploadCompletedFlag = false;
    this.showOpenBtn = false;
    this.progress = 0;
  }
  getProgressColor(): 'primary' | 'accent' | 'warn' {
    if (this.progress < 40) {
      return 'warn';       // red
    } else if (this.progress < 80) {
      return 'accent';    // pink
    } else {
      return 'primary';   // blue
    }
  }
}
