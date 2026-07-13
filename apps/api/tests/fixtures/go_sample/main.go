package main

import (
	"fmt"
	"github.com/sprintlogic/testgo/internal/auth"
)

func main() {
	fmt.Println("Starting...")
	token := auth.GenerateToken()
	fmt.Println(token)
}
