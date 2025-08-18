import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ServiceCenterSidebarComponent } from '../sidebar/sidebar.component'; 

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ServiceCenterSidebarComponent],
  templateUrl: './layout.component.html',
  template: `<router-outlet></router-outlet>`,
})

export class ServiceCenterLayoutComponent {}
