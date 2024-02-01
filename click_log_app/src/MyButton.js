const MyButton = () => {
    const handleClicked = () => {
        // APIを呼び出す予定
        console.log("Call BQ API!");
    };

    return (
        <button onClick={handleClicked}>Call BQ API!</button>
    );
};
export default MyButton;
