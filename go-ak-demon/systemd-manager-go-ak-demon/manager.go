package main

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
)

const (
	serviceName = "ble-bridge.service"
	unitPath    = "/etc/systemd/system/" + serviceName
)

func main() {
	if os.Geteuid() != 0 {
		log.Fatal("Please run the manager with sudo/root privileges.")
	}

	// 1. Check if the service file exists
	_, err := os.Stat(unitPath)
	exists := !os.IsNotExist(err)

	if exists {
		fmt.Printf("Systemd service [%s] is currently SETUP.\n", serviceName)
		fmt.Print("Would you like to REMOVE it? (y/n): ")
		if askConfirm() {
			removeService()
		}
	} else {
		fmt.Printf("Systemd service [%s] is NOT setup.\n", serviceName)
		fmt.Print("Would you like to ADD it? (y/n): ")
		if askConfirm() {
			addService()
		}
	}
}

func addService() {
	// Get absolute path of the privileged binary
	// absPath, _ := filepath.Abs("./privileged")
	absPath, _ := filepath.Abs("/usr/local/bin/privileged")

	unitContent := fmt.Sprintf(`[Unit]
Description=Privileged Bluetooth Bridge
After=network.target bluetooth.target
Before=display-manager.service

[Service]
ExecStart=%s
Restart=always
User=root
Group=root

[Install]
WantedBy=multi-user.target
`, absPath)

	err := os.WriteFile(unitPath, []byte(unitContent), 0644)
	if err != nil {
		log.Fatalf("Failed to write unit file: %v", err)
	}

	run("systemctl", "daemon-reload")
	run("systemctl", "enable", serviceName)
	run("systemctl", "start", serviceName)
	fmt.Println("Service added and started successfully.")
}

func removeService() {
	run("systemctl", "stop", serviceName)
	run("systemctl", "disable", serviceName)
	err := os.Remove(unitPath)
	if err != nil {
		log.Fatalf("Failed to remove unit file: %v", err)
	}
	run("systemctl", "daemon-reload")
	fmt.Println("Service removed successfully.")
}

func run(name string, arg ...string) {
	cmd := exec.Command(name, arg...)
	if err := cmd.Run(); err != nil {
		log.Printf("Warning: command %s failed: %v", name, err)
	}
}

func askConfirm() bool {
	var response string
	fmt.Scanln(&response)
	return response == "y" || response == "Y"
}
