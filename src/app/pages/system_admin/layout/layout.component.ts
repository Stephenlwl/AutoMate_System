import { Component, HostListener } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from '../sidebar/sidebar.component'; 
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, CommonModule],
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.css'],
  template: `<router-outlet></router-outlet>`,
})

export class LayoutComponent {
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
