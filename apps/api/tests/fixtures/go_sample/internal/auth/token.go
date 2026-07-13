package auth

func GenerateToken() string {
	return buildHash()
}
