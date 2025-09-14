import { Component, HostListener } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ServiceCenterSidebarComponent } from '../sidebar/sidebar.component';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ServiceCenterSidebarComponent, CommonModule],
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.css']
})
export class ServiceCenterLayoutComponent {
  isCollapsed = false;

  ngOnInit() {
    this.updateSidebarState();
  }

  @HostListener('window:resize', [])
  onResize() {
    this.updateSidebarState();
  }

  private updateSidebarState() {
    this.isCollapsed = window.innerWidth <= 768;
  }
}