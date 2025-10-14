import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AdminService } from '../auth/system-admin-auth';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterModule, CommonModule],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css']
})
export class SidebarComponent {
  expanded: { [key: string]: boolean } = {};

  systemAdminName: string | null = null;
  ngOnInit() {
    this.systemAdminName = this.adminService.getAdminName();
  }
  
  constructor(private adminService: AdminService) {}
  navItems = [
    { label: 'Dashboard', route: 'dashboard', icon: 'bi bi-speedometer2' },

    {
      label: 'Validate Account', icon: 'bi bi-person-check',
      children: [
        { label: 'Car Owner Account', route: 'validate-user-accounts' },
        {
          label: 'Car Repair Service Center', icon: 'bi bi-tools',
          children: [
            { label: 'Admin Account', route: 'validate-service-center-admin' },
          ]
        }
      ]
    },

    { label: 'Verify Vehicles', route: 'verify-vehicles', icon: 'bi bi-car-front' },
    { label: 'User Reviews', route: 'manage-review', icon: 'bi bi-chat-left-text' },
    { label: 'Manage Services', route: 'manage-services', icon: 'bi bi-gear' },
    { label: 'Manage Towing Services', route: 'manage-towing-services', icon: 'bi bi-truck' },
    { label: 'Manage Vehicles List', route: 'manage-vehicles-list', icon: 'bi bi-car-front' },
    { label: 'Chat Support', route: 'manage-chat', icon: 'bi bi-chat-dots' },
    { label: 'Logout', route: 'logout', icon: 'bi bi-box-arrow-right' }
  ];

  toggleExpand(item: string) {
    this.expanded[item] = !this.expanded[item];
  }

}
