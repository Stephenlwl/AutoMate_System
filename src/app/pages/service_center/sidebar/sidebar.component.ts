import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../auth/service-center-auth';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterModule, CommonModule],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css']
})
export class ServiceCenterSidebarComponent {
  private auth = inject(AuthService);

  expanded: { [key: string]: boolean } = {};
  serviceCenterName: string | null = null;
  role: string | null = null;

  ngOnInit() {
    this.serviceCenterName = this.auth.getServiceCenterName();
    this.role = this.auth.getRole();
  }

  managerNavItems = [
    { label: 'Dashboard', route: 'dashboard', icon: 'bi bi-speedometer2' },
    { label: 'Manage Service Bookings', route: 'manage-service-bookings', icon: 'bi bi-calendar-check' },
    { label: 'Manage Towing Bookings', route: 'manage-towing-bookings', icon: 'bi bi-calendar-check' },
    { label: 'Manage Bays', route: 'manage-bays', icon: 'bi bi-grid-3x3-gap' },
    { label: 'Manage Services', route: 'manage-services', icon: 'bi bi-tools' },
    { label: 'Manage Towing Service', route: 'manage-towing-services', icon: 'bi bi-truck' },
    { label: 'Chat Support', route: 'chat-support', icon: 'bi bi-chat-dots' },
    { label: 'Service Center Details', route: 'service-center-details', icon: 'bi bi-building' },
    { label: 'Profile', route: 'profile', icon: 'bi bi-person-circle' },
    { label: 'Manage Staff & Towing Driver', route: 'manage-staff-towing-driver', icon: 'bi bi-person-plus' },
    { label: 'Logout', route: 'login', icon: 'bi bi-box-arrow-right' }
  ];

  staffNavItems = [
    { label: 'Dashboard', route: 'dashboard', icon: 'bi bi-speedometer2' },
    { label: 'Manage Service Bookings', route: 'manage-service-bookings', icon: 'bi bi-calendar-check' },
    { label: 'Manage Towing Bookings', route: 'manage-towing-bookings', icon: 'bi bi-calendar-check' },
    { label: 'Profile', route: 'profile', icon: 'bi bi-person-circle' },
    { label: 'Logout', route: 'login', icon: 'bi bi-box-arrow-right' }
  ];

  toggleExpand(item: string) {
    this.expanded[item] = !this.expanded[item];
  }
}
