import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { HttpClientModule } from '@angular/common/http';
import { DragDropModule } from '@angular/cdk/drag-drop';

import { AppComponent } from './app.component';
import { WorksheetComponent } from './worksheet/worksheet.component';
import { DashboardmainComponent } from './dashboardmain/dashboardmain.component';
import { WorksheetLiteComponent } from './worksheet-lite/worksheet-lite.component';
import { FileUploadTestComponent } from './file-upload-test/file-upload-test.component';
import { ChartRendererComponent } from './worksheet-lite/chart-renderer.component';

import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { PropertyComponent } from './property/property.component';
import { FormsModule } from '@angular/forms';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRippleModule } from '@angular/material/core';

@NgModule({
  declarations: [
    AppComponent,
    WorksheetComponent,
    DashboardmainComponent,
    WorksheetLiteComponent,
    PropertyComponent,
    FileUploadTestComponent,
    ChartRendererComponent
  ],
  imports: [
    BrowserModule,
    HttpClientModule,
    AppRoutingModule,
    MatExpansionModule,
    MatIconModule,
    DragDropModule,
    MatSidenavModule,
    MatTooltipModule,
    MatTabsModule,
    MatCardModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
    FormsModule,
    MatDividerModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatRippleModule
  ],
  providers: [
    provideAnimationsAsync()
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
