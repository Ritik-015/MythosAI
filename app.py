# from core.llm import test_connection

# if __name__ == "__main__":
#     test_connection()


from core.llm import LLMClient

llm = LLMClient()

print("=".center(50, "="))
print("Mythos AI".center(50, " "))
print("=".center(50, "="))

while True:

    user = input("\nYou: ")

    if user.lower() in ["exit", "quit", "sleep", "q"]:
        break

    answer = llm.chat(user)

    print("\n Mythos: \n ")

    print(answer)